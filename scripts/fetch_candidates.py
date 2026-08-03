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
import sys
import threading
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import TypeVar

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import write_rows  # noqa: E402
from ingest.enrich import (  # noqa: E402
    CANDIDATE_CSV_COLUMNS,
    build_enrichment_row,
    has_omdb_data,
)
from ingest.http import cached_json, omdb_get, tmdb_get  # noqa: E402

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
            except Exception as err:  # noqa: BLE001 - one bad film must not stop the run
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


def _omdb_get(imdb_id: str) -> dict:
    if _OMDB_DOWN.is_set():
        return {}
    cache_file = ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json"
    try:
        return cached_json(
            cache_file,
            lambda: omdb_get(imdb_id, api_key=OMDB_KEY),
            is_valid=lambda d: bool(d),
        )
    except RuntimeError:
        # ingest/http.py raises this for 401/403 and says retrying cannot fix it.
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
    with open(CANDIDATE_ENRICHMENT, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _unfinished(rows: list[dict[str, str]]) -> dict[int, str]:
    """tmdb_id -> the seed's imdb_id, for every row still missing OMDb data."""
    pending: dict[int, str] = {}
    for row in rows:
        try:
            tmdb_id = int(row["tmdb_id"])
        except (ValueError, KeyError):
            continue
        if not has_omdb_data(row):
            pending[tmdb_id] = (row.get("imdb_id") or "").strip()
    return pending


def _existing_tmdb_ids() -> set[int]:
    ids: set[int] = set()
    for path in [FILM_ENRICHMENT, CANDIDATE_ENRICHMENT]:
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                try:
                    ids.add(int(row["tmdb_id"]))
                except (ValueError, KeyError):
                    pass
    return ids


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
    # A film OMDb could answer for, on a night it has stopped answering. Writing
    # it now would commit a row with no critic data and — before doneness was
    # measured by content — mark it finished forever. Leave it for tomorrow.
    if imdb_id and _OMDB_DOWN.is_set():
        return None

    omdb = _omdb_get(imdb_id) if imdb_id else {}

    return build_enrichment_row(
        data,
        omdb,
        tmdb_id=str(tmdb_id),
        imdb_id=imdb_id,
        # Matches the watched-film pipeline (update.py, rebuild_enrichment.py)
        # rather than diverging from it. These used to read TMDB only, which is
        # why the two halves of the dataset disagreed about genre names: OMDb
        # writes "Sci-Fi", TMDB "Science Fiction", and nothing joined them.
        #
        # Degrades safely. build_enrichment_row falls back to TMDB for genres,
        # runtime and countries whenever the OMDb dict is empty, which is what
        # happens once the free tier's 1,000 calls a day run out.
        prefer_omdb=True,
        omdb_countries=True,
        include_lang_collection=True,
        # title, release_date, tmdb_rating and tmdb_votes exist in the seed only
        # because one-off backfills added them. Without this flag every candidate
        # written here lands with no title, which is what put nameless films on
        # the production site.
        include_candidate_meta=True,
    )


def _ids_from(path: Path, column: str = "tmdb_id") -> set[int]:
    """Read a set of tmdb_ids from a CSV column, skipping unusable rows."""
    ids: set[int] = set()
    if not path.exists():
        return ids
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                ids.add(int(row[column]))
            except (ValueError, KeyError, TypeError):
                pass
    return ids


def _seed_ids() -> set[int]:
    """Films whose TMDB /similar results seed the candidate pool.

    Rated films alone bias the pool toward what has already been watched. The
    watchlist and the curated lists are explicit statements of intent about films
    NOT yet seen, so they widen the pool in the direction of actual interest.
    Both are already resolved to tmdb_ids (scripts/resolve_export.py).
    """
    rated = _ids_from(FILM_ENRICHMENT)
    watchlist = _ids_from(WATCHLIST_SEED)
    listed = _ids_from(RESOLVED_EXPORT)

    print(f"seeds: {len(rated)} rated, {len(watchlist)} watchlist, "
          f"{len(listed)} resolved export (watchlist + lists)")
    return rated | watchlist | listed


def main() -> None:
    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set")
    if not OMDB_KEY:
        raise SystemExit("OMDB_API_KEY not set")

    rows = _candidate_rows()
    pending = _unfinished(rows)
    existing = _existing_tmdb_ids()
    print(f"existing films: {len(existing)}")

    seed_ids = _seed_ids()
    candidate_ids: set[int] = set()
    print(f"fetching similar films for {len(seed_ids)} seed films "
          f"({MAX_WORKERS} workers)...")
    for similar in _parallel(_fetch_similar, sorted(seed_ids), "similar").values():
        if similar:
            candidate_ids.update(similar)

    print("fetching popular + top-rated lists...")
    candidate_ids.update(_fetch_list("movie/popular", pages=50))
    candidate_ids.update(_fetch_list("movie/top_rated", pages=50))

    new_ids = candidate_ids - existing
    print(f"candidates: {len(candidate_ids)} total, {len(new_ids)} new to enrich")
    print(f"retrying {len(pending)} candidates with no OMDb data yet")

    if not new_ids and not pending:
        print("no new candidates to enrich, nothing to retry")
        return

    # New candidates first, and in their own pass rather than one merged batch.
    # The OMDb allowance is the scarce resource and a single ThreadPoolExecutor
    # only approximates submission order, so a merged batch would let backlog
    # rows take quota from films that have none at all.
    enriched = _parallel(_enrich_tmdb, sorted(new_ids), "enriched")

    # Whatever allowance the new candidates left over. _enrich_tmdb returns None
    # for every row needing OMDb once the quota is gone, so this pass costs
    # almost nothing on a night that has already spent it.
    repaired = _parallel(
        lambda tid: _enrich_tmdb(tid, seed_imdb_id=pending[tid]),
        sorted(pending),
        "re-enriched",
    )

    # Rewriting the seed rather than appending to it. CLAUDE.md's append-only
    # rule protects film_log.csv, which is watch history and irreplaceable. This
    # seed is neither: every column is re-derivable from TMDB and OMDb, and a
    # row that never got its OMDb half can only be finished by editing it. The
    # rule still holds for the row COUNT — nothing here removes a row, and a
    # failed retry leaves the existing one untouched.
    # Built the same guarded way as _unfinished, and for the same reason: an
    # unparseable tmdb_id anywhere in 10k committed rows would otherwise raise
    # here and take the nightly down, after the API calls had already been spent.
    index: dict[int, int] = {}
    for position, row in enumerate(rows):
        try:
            index[int(row["tmdb_id"])] = position
        except (ValueError, KeyError):
            continue

    updated = 0
    for tmdb_id, row in repaired.items():
        # Only when the retry actually produced OMDb data. A rebuilt row that is
        # still empty differs from the committed one anyway — TMDB vote counts
        # move daily — so writing it back would put a thousand-line diff of pure
        # churn in front of the few rows that gained something.
        if row and has_omdb_data(row):
            rows[index[tmdb_id]] = row
            updated += 1

    appended = [enriched[tid] for tid in sorted(new_ids) if enriched.get(tid)]

    if not appended and not updated:
        print("nothing enriched this run; seed left untouched")
        return

    write_rows(CANDIDATE_ENRICHMENT, rows + appended, CANDIDATE_CSV_COLUMNS, strict=True)
    print(
        f"done: {len(appended)} new candidates appended, "
        f"{updated} existing rows filled in, in {CANDIDATE_ENRICHMENT.name}"
    )
    still_pending = len(pending) - updated
    if still_pending:
        print(f"  {still_pending} still without OMDb data; next run picks them up")


if __name__ == "__main__":
    main()
