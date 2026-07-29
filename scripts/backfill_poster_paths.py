"""One-off backfill: add poster_path to film_enrichment.csv.

The column was added to ingest/enrich.py after the catalogue was already built,
so every existing row is missing it. Reads poster_path from TMDB for each film
that has no value yet and rewrites the seed in place.

TMDB only. This must never call OMDb — see the note on the API budget below.

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

from ingest.csvio import dict_writer  # noqa: E402
from ingest.enrich import FILM_CSV_COLUMNS as COLUMNS  # noqa: E402
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

    if not args.apply:
        print("dry run — pass --apply to write")
        return

    # dict_writer, never csv.DictWriter: the stdlib writer emits CRLF on every
    # platform and .gitattributes checks these seeds out as LF. Mixing the two
    # makes DuckDB's sniffer fail the dbt build.
    with open(SEED, "w", encoding="utf-8", newline="") as fh:
        w = dict_writer(fh, COLUMNS)
        w.writeheader()
        for row in rows:
            w.writerow({c: row.get(c, "") for c in COLUMNS})
    print(f"wrote {SEED.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
