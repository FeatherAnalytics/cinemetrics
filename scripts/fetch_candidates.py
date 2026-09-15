"""Fetch candidate films from TMDB for the recommendation pool.

Two sources:
1. TMDB /movie/{id}/similar for each rated film (taste graph)
2. TMDB /movie/popular and /movie/top_rated (broad backfill)

Deduplicates against existing film_enrichment.csv and candidate_enrichment.csv.
Enriches new candidates via TMDB + OMDb and writes candidate_enrichment.csv.

Candidates are also RE-enriched. A candidate is finished only when it carries
data OMDb supplied, not merely because its tmdb_id appears in the seed. Rows
that fall short are attempted again on the next run and rewritten in place, so
a night that runs out of OMDb quota leaves work for the next one instead of
leaving a permanently empty row behind. This is the one writer that edits
committed rows rather than only appending; see the note in main().
"""
import csv
import os
import threading
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import TypeVar

from dotenv import load_dotenv

from ingest.csvio import read_id_set, write_rows
from ingest.enrich import (
    CANDIDATE_CSV_COLUMNS,
    build_enrichment_row,
    has_omdb_data,
    is_terminal,
)
from ingest.http import cached_json, omdb_get, tmdb_get

ROOT = Path(__file__).resolve().parents[1]
load_dotenv()

SEEDS = ROOT / "transform" / "seeds"
FILM_ENRICHMENT = SEEDS / "film_enrichment.csv"
CANDIDATE_ENRICHMENT = SEEDS / "candidate_enrichment.csv"
WATCHLIST_SEED = SEEDS / "watchlist.csv"
# Watchlist + list films resolved to tmdb_ids; absent until resolve_export.py runs.
RESOLVED_EXPORT = ROOT / "data" / "raw" / "letterboxd_export" / "resolved.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

TMDB_KEY = os.environ.get("TMDB_API_KEY")
OMDB_KEY = os.environ.get("OMDB_API_KEY")

# These calls are I/O-bound, so threads give the same throughput as asyncio here.
# Threads specifically, NOT asyncio: ingest/http.py is built on `requests`, and
# going async would mean an aiohttp rewrite that every caller (update.py,
# tmdb.py, omdb.py, resolve_export.py) would have to follow. Threads keep the
# existing retry/backoff and caching untouched.
MAX_WORKERS = int(os.environ.get("TMDB_MAX_WORKERS", "8"))

T = TypeVar("T")
R = TypeVar("R")


def _parallel(fn: Callable[[T], R], items: Iterable[T], label: str) -> dict[T, R | None]:
    """Run fn over items concurrently. Failures yield None, never abort the batch.

    Returns a dict so callers can re-impose a deterministic order; completion
    order is arbitrary and must not leak into the CSV.
    """
    items = list(items)
    results: dict[T, R | None] = {}
    if not items:
        return results

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fn, item): item for item in items}
        for done, future in enumerate(as_completed(futures), 1):
            item = futures[future]
            try:
                results[item] = future.result()
            except Exception as err:
                print(f"  warning: {label} failed for {item}: {err}")
                results[item] = None
            if done % 200 == 0:
                print(f"  {done}/{len(items)} {label}...", flush=True)
    return results


def _tmdb_get(path: str, **params) -> dict:
    return tmdb_get(path, api_key=TMDB_KEY, **params)


# Set once OMDb rejects the credential, which on the free tier is how the
# 1,000-call daily allowance reports being spent. Every later film that needs
# OMDb is skipped rather than asked, because the answer cannot change before
# the quota resets. Without this a rate-limited run spends the rest of its
# night issuing thousands of requests that are all guaranteed to fail — and
# CI starts with an empty cache (data/raw is gitignored), so nothing absorbs
# them. An Event because _parallel calls this from every worker thread.
_OMDB_DOWN = threading.Event()
_omdb_call_count = 0
_omdb_call_lock = threading.Lock()

# 46k rows, +800 a night at 50 pages, 30 of 30 nightly commits touching the
# seed, 24.6 MiB pack. Cap growth at the source rather than pruning later.
MAX_ADMIT = 300
LIST_PAGES = 10


def _omdb_get(imdb_id: str) -> dict:
    global _omdb_call_count
    if _OMDB_DOWN.is_set():
        return {}
    cache_file = ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json"
    if cache_file.exists():
        return cached_json(cache_file, lambda: {}, is_valid=lambda d: bool(d))
    with _omdb_call_lock:
        _omdb_call_count += 1
    try:
        return cached_json(
            cache_file,
            lambda: omdb_get(imdb_id, api_key=OMDB_KEY),
            is_valid=lambda d: bool(d),
        )
    except RuntimeError:
        _OMDB_DOWN.set()
        raise


def _candidate_rows() -> list[dict[str, str]]:
    """The committed candidate seed, in file order.

    Order is preserved because the rewrite puts these rows back exactly where
    they were. The seed is three appended-and-sorted runs rather than one sorted
    file, so re-sorting it would rewrite all 10k lines and bury the handful a
    run actually changed.
    """
    if not CANDIDATE_ENRICHMENT.exists():
        return []
    with CANDIDATE_ENRICHMENT.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _unfinished(rows: list[dict[str, str]]) -> dict[int, str]:
    """tmdb_id -> the seed's imdb_id, for every row still missing OMDb data."""
    pending: dict[int, str] = {}
    for row in rows:
        try:
            tmdb_id = int(row["tmdb_id"])
        except (ValueError, KeyError):
            continue
        if is_terminal(row):
            continue
        if not has_omdb_data(row):
            pending[tmdb_id] = (row.get("imdb_id") or "").strip()
    return pending


def _existing_tmdb_ids() -> set[int]:
    return read_id_set(FILM_ENRICHMENT) | read_id_set(CANDIDATE_ENRICHMENT)


def _fetch_similar(tmdb_id: int) -> list[int]:
    cache_file = CACHE / f"similar_{tmdb_id}.json"

    def produce() -> list[int]:
        data = _tmdb_get(f"movie/{tmdb_id}/similar", page=1)
        return [m["id"] for m in data.get("results", [])]

    # Only cache a genuine non-empty result; an empty/failed response would
    # otherwise poison the cache permanently.
    return cached_json(cache_file, produce, is_valid=lambda ids: len(ids) > 0)


def _fetch_list(endpoint: str, pages: int = 50) -> list[int]:
    """Page through a TMDB list endpoint, fetching pages 2..N concurrently.

    Page 1 is fetched alone because only it can tell us how many pages exist.
    """
    first = _tmdb_get(endpoint, page=1)
    ids: list[int] = [m["id"] for m in first.get("results", [])]

    last = min(pages, first.get("total_pages", 1))
    if last < 2:
        return ids

    fetched = _parallel(
        lambda page: _tmdb_get(endpoint, page=page),
        range(2, last + 1),
        f"{endpoint} pages",
    )
    for page in range(2, last + 1):  # deterministic order
        data = fetched.get(page) or {}
        ids.extend(m["id"] for m in data.get("results", []))
    return ids


def _enrich_tmdb(tmdb_id: int, *, seed_imdb_id: str = "") -> dict | None:
    """Build a candidate row, or None when this film cannot be finished now.

    ``seed_imdb_id`` is the id the seed already holds for a row being retried.
    It lets an exhausted run bail before the TMDB call rather than after it.
    """
    if seed_imdb_id and _OMDB_DOWN.is_set():
        return None

    cache_file = CACHE / f"detail_{tmdb_id}.json"
    # Only cache a real hit (data with an id); a failed lookup must not be cached.
    data = cached_json(
        cache_file,
        lambda: _tmdb_get(f"movie/{tmdb_id}", append_to_response="keywords"),
        is_valid=lambda d: bool(d.get("id")),
    )
    if not data.get("id"):
        return None

    imdb_id = data.get("imdb_id", "")

    if not imdb_id:
        row = build_enrichment_row(
            data, {}, tmdb_id=str(tmdb_id), imdb_id="",
            prefer_omdb=True, omdb_countries=True,
            include_lang_collection=True, include_candidate_meta=True,
        )
        row["omdb_status"] = "no_imdb_id"
        return row

    # A film OMDb could answer for, on a night it has stopped answering. Writing
    # it now would commit a row with no critic data and — before doneness was
    # measured by content — mark it finished forever. Leave it for tomorrow.
    if _OMDB_DOWN.is_set():
        return None

    omdb = _omdb_get(imdb_id)

    row = build_enrichment_row(
        data,
        omdb,
        tmdb_id=str(tmdb_id),
        imdb_id=imdb_id,
        prefer_omdb=True,
        omdb_countries=True,
        include_lang_collection=True,
        include_candidate_meta=True,
    )

    if omdb.get("Response") == "True" and omdb.get("Type", "movie") != "movie":
        row["omdb_status"] = "not_a_film"
    elif omdb.get("Response") == "False" and not _OMDB_DOWN.is_set():
        row["omdb_status"] = "not_found"
    elif has_omdb_data(row):
        row["omdb_status"] = "ok"
    else:
        row["omdb_status"] = ""

    return row


def _seed_ids() -> set[int]:
    """Films whose TMDB /similar results seed the candidate pool."""
    rated = read_id_set(FILM_ENRICHMENT)
    watchlist = read_id_set(WATCHLIST_SEED)
    listed = read_id_set(RESOLVED_EXPORT)

    print(f"seeds: {len(rated)} rated, {len(watchlist)} watchlist, "
          f"{len(listed)} resolved export (watchlist + lists)")
    return rated | watchlist | listed


def _admit(
    similar_ids: set[int], list_ids: list[int], existing: set[int],
) -> list[tuple[int, str]]:
    """Pick at most MAX_ADMIT new candidates, similar first."""
    admitted: list[tuple[int, str]] = []
    seen = set(existing)
    for tid in sorted(similar_ids - seen):
        if len(admitted) >= MAX_ADMIT:
            break
        admitted.append((tid, "similar"))
        seen.add(tid)
    for tid in list_ids:
        if len(admitted) >= MAX_ADMIT:
            break
        if tid not in seen:
            admitted.append((tid, "list"))
            seen.add(tid)
    return admitted


def _reverify(rows: list[dict[str, str]], budget: int) -> int:
    """Re-ask OMDb for ok_legacy rows to check Type; returns count updated."""
    updated = 0
    for row in rows:
        if budget <= 0 or _OMDB_DOWN.is_set():
            break
        if row.get("omdb_status") != "ok_legacy":
            continue
        imdb_id = (row.get("imdb_id") or "").strip()
        if not imdb_id:
            continue
        omdb = _omdb_get(imdb_id)
        if not omdb:
            continue
        budget -= 1
        if omdb.get("Response") == "True" and omdb.get("Type", "movie") != "movie":
            row["omdb_status"] = "not_a_film"
        else:
            row["omdb_status"] = "ok"
        updated += 1
    return updated


def main() -> None:
    global _omdb_call_count
    _omdb_call_count = 0

    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set")
    if not OMDB_KEY:
        raise SystemExit("OMDB_API_KEY not set")

    rows = _candidate_rows()
    pending = _unfinished(rows)
    existing = _existing_tmdb_ids()
    print(f"existing films: {len(existing)}")

    seed_ids = _seed_ids()
    similar_ids: set[int] = set()
    print(f"fetching similar films for {len(seed_ids)} seed films "
          f"({MAX_WORKERS} workers)...")
    for similar in _parallel(_fetch_similar, sorted(seed_ids), "similar").values():
        if similar:
            similar_ids.update(similar)

    print(f"fetching popular + top-rated lists (pages={LIST_PAGES})...")
    list_ids: list[int] = []
    list_ids.extend(_fetch_list("movie/popular", pages=LIST_PAGES))
    list_ids.extend(_fetch_list("movie/top_rated", pages=LIST_PAGES))

    admitted = _admit(similar_ids, list_ids, existing)
    new_ids = [tid for tid, _ in admitted]
    sources = dict(admitted)
    skipped = len((similar_ids | set(list_ids)) - existing) - len(new_ids)
    print(f"candidates: {len(new_ids)} admitted (max {MAX_ADMIT}), "
          f"{skipped} skipped, {len(pending)} to retry")

    appended = 0
    retried = 0

    if new_ids or pending:
        enriched = _parallel(_enrich_tmdb, sorted(new_ids), "enriched")

        repaired = _parallel(
            lambda tid: _enrich_tmdb(tid, seed_imdb_id=pending[tid]),
            sorted(pending),
            "re-enriched",
        )

        index: dict[int, int] = {}
        for position, row in enumerate(rows):
            try:
                index[int(row["tmdb_id"])] = position
            except (ValueError, KeyError):
                continue

        for tmdb_id, row in repaired.items():
            if row and (has_omdb_data(row) or is_terminal(row)):
                rows[index[tmdb_id]] = row
                retried += 1

        for tid in sorted(new_ids):
            row = enriched.get(tid)
            if row:
                row["source"] = sources.get(tid, "")
                rows.append(row)
                appended += 1

    # Re-verify legacy rows with leftover OMDb budget
    leftover = max(0, min(1000 - _omdb_call_count, 500))
    reverified = _reverify(rows, leftover)
    if reverified:
        print(f"re-verified {reverified} ok_legacy rows ({_omdb_call_count} OMDb calls total)")

    if not appended and not retried and not reverified:
        print("nothing enriched this run; seed left untouched")
        return

    write_rows(CANDIDATE_ENRICHMENT, rows, CANDIDATE_CSV_COLUMNS, strict=True)  # type: ignore
    print(f"done: {appended} new, {retried} retried, {reverified} re-verified")


if __name__ == "__main__":
    main()
