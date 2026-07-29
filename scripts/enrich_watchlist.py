"""Enrich watchlist films that no enrichment seed covers yet.

The watchlist seed carries only tmdb_id/title/release_year/added_date, so the
watchlist charts (genre, release year, keywords, language, country) have nothing
to plot until each film has an enrichment row. Films already watched are covered
by film_enrichment.csv, and a slice of the watchlist happens to have been pulled
into the recommendation pool already, so only the remainder needs fetching.

Rows are appended to candidate_enrichment.csv rather than a seed of their own:
the schema is identical, the semantics match (films not yet rated), and
fetch_candidates.py already dedupes against both seeds, so a film enriched here
will not be fetched twice. The side effect is that these films join the
recommendation pool, which is the intended behaviour -- a recommendation the
reader already shortlisted is a hit.

Usage:
    uv run python scripts/enrich_watchlist.py           # preview what's missing
    uv run python scripts/enrich_watchlist.py --apply   # fetch and append
"""

import argparse
import csv
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402
from ingest.enrich import ENRICHMENT_CSV_COLUMNS, build_enrichment_row  # noqa: E402
from ingest.http import cached_json, omdb_get, tmdb_get  # noqa: E402

SEEDS = ROOT / "transform" / "seeds"
FILM_ENRICHMENT = SEEDS / "film_enrichment.csv"
CANDIDATE_ENRICHMENT = SEEDS / "candidate_enrichment.csv"
WATCHLIST = SEEDS / "watchlist.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

TMDB_KEY = os.environ.get("TMDB_API_KEY")
OMDB_KEY = os.environ.get("OMDB_API_KEY")
MAX_WORKERS = int(os.environ.get("TMDB_MAX_WORKERS", "8"))


def _ids(path: Path) -> set[int]:
    """tmdb_ids present in a seed, skipping rows whose id will not parse."""
    out: set[int] = set()
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                out.add(int(row["tmdb_id"]))
            except (ValueError, KeyError, TypeError):
                pass
    return out


def _watchlist_rows() -> list[dict[str, str]]:
    with WATCHLIST.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _enrich(tmdb_id: int) -> dict[str, str] | None:
    """Fetch TMDB detail + OMDb for one film. Returns None if TMDB has no record.

    Flags match fetch_candidates.py exactly, so a row appended here is
    byte-identical to one the candidate fetcher would have written for the same
    film -- the two writers must not produce different shapes for one seed.
    """
    cache_file = CACHE / f"detail_{tmdb_id}.json"
    data = cached_json(
        cache_file,
        lambda: tmdb_get(f"movie/{tmdb_id}", api_key=TMDB_KEY, append_to_response="keywords"),
        is_valid=lambda d: bool(d.get("id")),
    )
    if not data.get("id"):
        return None

    imdb_id = data.get("imdb_id", "")
    omdb = {}
    if imdb_id:
        omdb = cached_json(
            ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json",
            lambda: omdb_get(imdb_id, api_key=OMDB_KEY),
            is_valid=lambda d: bool(d),
        )

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
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default: preview)")
    args = parser.parse_args()

    if not WATCHLIST.exists():
        print(f"missing {WATCHLIST} -- run scripts/build_watchlist_seed.py first", file=sys.stderr)
        return 1

    rows = _watchlist_rows()
    covered = _ids(FILM_ENRICHMENT) | _ids(CANDIDATE_ENRICHMENT)

    missing: list[tuple[int, str]] = []
    for row in rows:
        try:
            tid = int(row["tmdb_id"])
        except (ValueError, KeyError, TypeError):
            continue
        if tid not in covered:
            missing.append((tid, row.get("title", "")))

    print(f"watchlist films : {len(rows)}")
    print(f"already enriched: {len(rows) - len(missing)}")
    print(f"missing         : {len(missing)}")

    if not missing:
        print("nothing to fetch")
        return 0

    for tid, title in missing[:10]:
        print(f"      {tid}  {title}")
    if len(missing) > 10:
        print(f"      ... and {len(missing) - 10} more")

    if not args.apply:
        print("\nDRY RUN -- no rows written. Re-run with --apply.")
        return 0

    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set")
    if not OMDB_KEY:
        raise SystemExit("OMDB_API_KEY not set")

    ids = sorted(tid for tid, _ in missing)
    print(f"\nfetching {len(ids)} films ({MAX_WORKERS} workers)...")

    # Fetch concurrently, write in sorted order: completion order is arbitrary
    # and must not leak into the seed.
    results: dict[int, dict[str, str] | None] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_enrich, tid): tid for tid in ids}
        for future in as_completed(futures):
            tid = futures[future]
            try:
                results[tid] = future.result()
            except Exception as err:  # noqa: BLE001 - one bad film must not stop the batch
                print(f"  warning: enrich failed for {tid}: {err}")
                results[tid] = None

    write_header = not CANDIDATE_ENRICHMENT.exists()
    with CANDIDATE_ENRICHMENT.open("a", newline="", encoding="utf-8") as fh:
        writer = dict_writer(fh, ENRICHMENT_CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        written = 0
        for tid in ids:
            row = results.get(tid)
            if row:
                writer.writerow(row)
                written += 1

    failed = len(ids) - written
    print(f"appended {written} rows to {CANDIDATE_ENRICHMENT.name}")
    if failed:
        print(f"{failed} films could not be enriched (TMDB returned no record)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
