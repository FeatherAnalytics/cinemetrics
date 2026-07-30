"""Backfill transform/seeds/poster_slices.csv from dim_film.poster_path.

Idempotent: only films missing a slice are fetched, so a re-run after new films
land costs one request each rather than 676, and a run that repairs nothing
leaves the seed byte-identical. That is what makes it safe to wire into the daily
workflow as a repair step.

Fetches poster images from image.tmdb.org, which needs no API key and has no
daily cap. It never calls OMDb.

Dry run by default; pass --apply to write.

    uv run python scripts/backfill_poster_slices.py
    uv run python scripts/backfill_poster_slices.py --apply
"""

import argparse
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.poster_slice import read_slice_seed, slice_for_poster, write_slice_seed  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "movies.duckdb"
SEED = ROOT / "transform" / "seeds" / "poster_slices.csv"


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

    have = read_slice_seed(SEED)
    before = dict(have)
    # "" means both "never fetched" and "fetched, the CDN served nothing", so a
    # poster that 404s permanently is retried on every run. Kept that way on
    # purpose: it is one request per such film per night, image.tmdb.org has no
    # daily cap, and a poster added to TMDB later is picked up for free. The
    # alternative is a third state in a two-column seed whose only reader maps
    # "" to NULL, which costs more than the requests do.
    todo = [(str(t), p) for t, p in films if not have.get(str(t))]
    print(f"{len(films)} films with posters, {len(have)} already sliced, {len(todo)} to fetch")

    # Before the fetch loop, not after it. The check used to sit below, so a
    # preview downloaded every poster image it was previewing and then threw the
    # slices away. Matches backfill_candidate_poster_paths.py.
    if not args.apply:
        print("dry run — pass --apply to write")
        return

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

    # Nothing to write is the normal nightly outcome, and the write is skipped
    # rather than performed and found to be a no-op. The nightly's sha256sum gate
    # reads this file to decide whether a repair happened, and the commit that
    # follows carries whatever the file says, so a writer with nothing to change
    # has to leave the bytes alone.
    #
    # Compares the mapping rather than checking `todo`, because a run whose
    # every fetch failed, and a run that re-fetched a permanently empty poster
    # and got "" again, both had work to do and both changed nothing.
    if have == before:
        print("nothing changed — seed left untouched")
        return

    write_slice_seed(SEED, have)
    # SEED.name, not relative_to(ROOT): the write has already landed by this
    # point, so a path this line cannot render must not be able to raise.
    print(f"wrote {SEED.name}")


if __name__ == "__main__":
    main()
