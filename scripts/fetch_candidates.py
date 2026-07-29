"""Fetch candidate films from TMDB for the recommendation pool.

Two sources:
1. TMDB /movie/{id}/similar for each rated film (taste graph)
2. TMDB /movie/popular and /movie/top_rated (broad backfill)

Deduplicates against existing film_enrichment.csv and candidate_enrichment.csv.
Enriches new candidates via TMDB + OMDb and appends to candidate_enrichment.csv.
"""

import csv
import os
import sys
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import TypeVar

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402
from ingest.enrich import CANDIDATE_CSV_COLUMNS, build_enrichment_row  # noqa: E402
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


def _omdb_get(imdb_id: str) -> dict:
    cache_file = ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json"
    return cached_json(
        cache_file,
        lambda: omdb_get(imdb_id, api_key=OMDB_KEY),
        is_valid=lambda d: bool(d),
    )


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


def _enrich_tmdb(tmdb_id: int) -> dict | None:
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
        # candidate_enrichment.csv predates poster_path and has no such column;
        # CANDIDATE_CSV_COLUMNS omits it, and strict=True below would raise on
        # the leftover key if the shared builder still emitted it.
        include_poster_path=False,
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

    if not new_ids:
        print("no new candidates to enrich")
        return

    # Enrich concurrently, then write serially in sorted order so the appended
    # rows are deterministic regardless of which thread finished first.
    rows_by_id = _parallel(_enrich_tmdb, sorted(new_ids), "enriched")

    write_header = not CANDIDATE_ENRICHMENT.exists()
    enriched = 0
    with open(CANDIDATE_ENRICHMENT, "a", newline="", encoding="utf-8") as fh:
        writer = dict_writer(fh, CANDIDATE_CSV_COLUMNS, strict=True)
        if write_header:
            writer.writeheader()
        for tid in sorted(new_ids):
            row = rows_by_id.get(tid)
            if row:
                writer.writerow(row)
                enriched += 1

    print(f"done: {enriched} new candidates appended to {CANDIDATE_ENRICHMENT.name}")


if __name__ == "__main__":
    main()
