"""One-off backfill: add poster_path to film_enrichment.csv.

The column was added to ingest/enrich.py after the catalogue was already built,
so every existing row is missing it. Reads poster_path from TMDB for each film
that has no value yet and rewrites the seed in place.

TMDB only, and deliberately never OMDb: OMDb's free tier allows 1,000 calls a
day and does not serve poster art at all, so reaching for it here would spend
two thirds of the daily budget on a field it cannot answer.

Dry run by default; pass --apply to write.

    uv run python scripts/backfill_poster_paths.py
    uv run python scripts/backfill_poster_paths.py --apply
"""

import argparse
import csv
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.csvio import write_rows  # noqa: E402
from ingest.enrich import FILM_CSV_COLUMNS  # noqa: E402
from ingest.http import tmdb_get  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "transform" / "seeds" / "film_enrichment.csv"


def fetch_poster_path(tmdb_id: str, key: str) -> str:
    movie = tmdb_get(f"movie/{tmdb_id}", api_key=key)
    return movie.get("poster_path") or ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the seed")
    args = ap.parse_args()

    load_dotenv()
    key = os.environ.get("TMDB_API_KEY")
    if not key:
        raise SystemExit("TMDB_API_KEY not set. Add it to .env.")

    with open(SEED, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    todo = [r for r in rows if not r.get("poster_path")]
    print(f"{len(rows)} rows, {len(todo)} missing poster_path")

    # Before the fetch loop, not after it. The check used to sit below, so a
    # preview spent one TMDB call per missing row -- 676 of them on the first
    # run -- and then discarded every answer. Matches
    # backfill_candidate_poster_paths.py, which already returns here.
    if not args.apply:
        print("dry run — pass --apply to write")
        return

    filled = misses = 0
    for i, row in enumerate(todo, 1):
        path = fetch_poster_path(row["tmdb_id"], key)
        row["poster_path"] = path
        if path:
            filled += 1
        else:
            misses += 1
            print(f"  no poster for tmdb_id={row['tmdb_id']}")
        if i % 100 == 0:
            print(f"  {i}/{len(todo)} ...")

    print(f"{filled} filled, {misses} with no poster on TMDB")

    write_rows(SEED, rows, FILM_CSV_COLUMNS)
    print(f"wrote {SEED.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
