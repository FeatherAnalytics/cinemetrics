"""One-off backfill: add poster_path to candidate_enrichment.csv.

The candidate seed was built before poster_path existed, so all 7,770 rows are
missing it and the recommendation drawer has no art to render. Reads poster_path
for every candidate that has no value yet and rewrites the seed in place.

TMDB only, and deliberately never OMDb. OMDb does not serve poster art at all,
and its free tier allows 1,000 calls a day: 7,770 rows would be nearly eight
days of quota spent on a field it cannot answer. That also rules out
scripts/rebuild_enrichment.py, which re-fetches both APIs per row.

Most detail payloads are already cached under data/raw/tmdb_candidates, so this
only hits the network for the remainder. Those remaining calls are fetched
concurrently: sequentially they run at about 1.4 s each, which is over two hours
for 7,770 rows.

Resumable. The seed is rewritten after every CHECKPOINT rows through the same
atomic write as the final one, and rows that already carry a value are skipped,
so an interrupted run only costs the rows it had not reached.

Dry run by default; pass --apply to write.

    uv run python scripts/backfill_candidate_poster_paths.py
    uv run python scripts/backfill_candidate_poster_paths.py --apply
"""

import argparse
import csv
import os
import sys
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.csvio import write_rows  # noqa: E402
from ingest.enrich import CANDIDATE_CSV_COLUMNS  # noqa: E402
from ingest.http import cached_json, tmdb_get  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "transform" / "seeds" / "candidate_enrichment.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

# Rows between seed writes, and the size of one concurrent batch. Small enough
# that an interruption loses minutes rather than the whole run, large enough
# that the rewrites are not the cost.
CHECKPOINT = 500
PROGRESS = 250
# I/O-bound, so threads reach the same throughput as asyncio would, and they
# leave ingest/http.py's retry/backoff and caching untouched. Matches the other
# TMDB scripts in this directory.
MAX_WORKERS = int(os.environ.get("TMDB_MAX_WORKERS", "8"))


def fetch_poster_path(tmdb_id: str, key: str) -> str:
    """poster_path for one film, from the cached detail payload when there is one."""
    movie = cached_json(
        CACHE / f"detail_{tmdb_id}.json",
        lambda: tmdb_get(f"movie/{tmdb_id}", api_key=key, append_to_response="keywords"),
        is_valid=lambda d: bool(d.get("id")),
    )
    return movie.get("poster_path") or ""


def _batches(rows: list[dict], size: int) -> Iterator[list[dict]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write the seed")
    args = ap.parse_args()

    load_dotenv()
    key = os.environ.get("TMDB_API_KEY")
    if not key:
        raise SystemExit("TMDB_API_KEY not set. Add it to .env.")

    with open(SEED, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = list(reader.fieldnames or [])
        rows = list(reader)

    # The column list belongs to this file, not to the concept of enrichment:
    # film_enrichment.csv has a different one. Pin it against the real header
    # before rewriting 7,770 committed rows with it.
    expected = [c for c in CANDIDATE_CSV_COLUMNS if c != "poster_path"]
    if header not in (CANDIDATE_CSV_COLUMNS, expected):
        raise SystemExit(
            f"unexpected header in {SEED.name}:\n  {header}\nexpected:\n  {CANDIDATE_CSV_COLUMNS}"
        )

    todo = [r for r in rows if not r.get("poster_path")]
    print(f"{len(rows)} rows, {len(todo)} missing poster_path")

    if not args.apply:
        print("dry run — pass --apply to write")
        return

    print(f"fetching with {MAX_WORKERS} workers, checkpoint every {CHECKPOINT}")
    filled = misses = errors = done = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        # One batch at a time, then a checkpoint: no row is written to the seed
        # before its fetch has actually come back.
        for batch in _batches(todo, CHECKPOINT):
            futures = {pool.submit(fetch_poster_path, r["tmdb_id"], key): r for r in batch}
            for future in as_completed(futures):
                row = futures[future]
                done += 1
                try:
                    path = future.result()
                except Exception as err:  # noqa: BLE001 - one bad film must not stop the run
                    # Left empty so a later run retries it rather than recording
                    # "no art".
                    print(f"  warning: tmdb_id={row['tmdb_id']}: {err}")
                    row["poster_path"] = ""
                    errors += 1
                    continue
                row["poster_path"] = path
                if path:
                    filled += 1
                else:
                    misses += 1
                if done % PROGRESS == 0:
                    print(f"  {done}/{len(todo)} ...", flush=True)
            write_rows(SEED, rows, CANDIDATE_CSV_COLUMNS)
            print(f"  checkpoint: wrote {SEED.name} at {done}/{len(todo)}", flush=True)

    write_rows(SEED, rows, CANDIDATE_CSV_COLUMNS)
    print(f"wrote {SEED.relative_to(ROOT)}")
    print(f"{filled} filled, {misses} with no poster on TMDB, {errors} failed")


if __name__ == "__main__":
    main()
