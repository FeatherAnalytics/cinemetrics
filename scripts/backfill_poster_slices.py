"""Backfill transform/seeds/poster_slices.csv from dim_film.poster_path.

Idempotent: only films missing a slice are fetched, so a re-run after new films
land costs one request each rather than 676. That is what makes it safe to wire
into the daily workflow as a repair step.

Fetches poster images from image.tmdb.org, which needs no API key and has no
daily cap. It never calls OMDb.

Dry run by default; pass --apply to write.

    uv run python scripts/backfill_poster_slices.py
    uv run python scripts/backfill_poster_slices.py --apply
"""

import argparse
import csv
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.csvio import write_rows  # noqa: E402
from ingest.poster_slice import SLICE_CSV_COLUMNS, slice_for_poster  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "movies.duckdb"
SEED = ROOT / "transform" / "seeds" / "poster_slices.csv"


def existing() -> dict[str, str]:
    if not SEED.exists():
        return {}
    with open(SEED, encoding="utf-8", newline="") as fh:
        return {r["tmdb_id"]: r["slice"] for r in csv.DictReader(fh)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the seed")
    args = ap.parse_args()

    con = duckdb.connect(str(DB), read_only=True)
    films = con.execute(
        "select tmdb_id, poster_path from marts.dim_film "
        "where poster_path is not null order by tmdb_id"
    ).fetchall()
    con.close()

    have = existing()
    todo = [(str(t), p) for t, p in films if not have.get(str(t))]
    print(f"{len(films)} films with posters, {len(have)} already sliced, {len(todo)} to fetch")

    misses = 0
    for i, (tmdb_id, path) in enumerate(todo, 1):
        try:
            have[tmdb_id] = slice_for_poster(path)
        except Exception as e:  # noqa: BLE001 - one bad poster must not lose the rest
            misses += 1
            print(f"  skip tmdb_id={tmdb_id}: {e}")
        if i % 100 == 0:
            print(f"  {i}/{len(todo)} ...")

    filled = sum(1 for v in have.values() if v)
    print(f"{filled} slices, {misses} failed")

    if not args.apply:
        print("dry run — pass --apply to write")
        return

    write_rows(
        SEED,
        [{"tmdb_id": t, "slice": have[t]} for t in sorted(have, key=int)],
        SLICE_CSV_COLUMNS,
        strict=True,
    )
    print(f"wrote {SEED.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
