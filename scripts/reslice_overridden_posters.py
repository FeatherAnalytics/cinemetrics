"""Re-slice the films listed in transform/seeds/poster_overrides.csv.

WHY THIS IS NOT backfill_poster_slices.py. That script fetches a film only when
it has no slice yet, which is what makes it cheap enough to run every night, and
also what means a film whose poster CHANGES is never re-sliced. Teaching it to
notice a changed path would mean poster_slices.csv remembering which path each
slice came from -- a third column on a 677-row seed with two writers -- to serve
a case the pipeline cannot produce on its own: the enrichment seeds are
append-only, so TMDB's recorded poster_path for a film never moves. A curated
override is the only thing that changes a film's art, and that is a hand edit.

So the trigger is a human editing a seed, and the repair is keyed off that seed
rather than off two hardcoded ids: add a row to poster_overrides.csv, run this,
and whatever is in the file gets re-sliced. One image fetch per override row.

Note the narrower job this leaves: a film that is overridden BEFORE it has any
slice needs nothing from here, because backfill_poster_slices.py reads
dim_film.poster_path, which already resolves the override.

Fetches from image.tmdb.org, which needs no API key. It never calls OMDb.

Dry run by default; pass --apply to write.

    uv run python scripts/reslice_overridden_posters.py
    uv run python scripts/reslice_overridden_posters.py --apply
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.poster_slice import read_slice_seed, slice_for_poster, write_slice_seed  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / "transform" / "seeds"
OVERRIDES = SEEDS / "poster_overrides.csv"
SLICES = SEEDS / "poster_slices.csv"


def read_overrides() -> dict[str, str]:
    """The override seed as {tmdb_id: poster_path}, empty when it does not exist."""
    if not OVERRIDES.exists():
        return {}
    with open(OVERRIDES, encoding="utf-8", newline="") as fh:
        return {r["tmdb_id"]: r["poster_path"] for r in csv.DictReader(fh)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the seed")
    args = ap.parse_args()

    overrides = read_overrides()
    slices = read_slice_seed(SLICES)
    print(f"{len(overrides)} overridden posters")

    changed: dict[str, str] = {}
    for tmdb_id, path in sorted(overrides.items(), key=lambda kv: int(kv[0])):
        try:
            fresh = slice_for_poster(path)
        except Exception as e:  # noqa: BLE001 - one bad poster must not lose the rest
            print(f"  skip tmdb_id={tmdb_id}: {e}")
            continue
        if not fresh:
            print(f"  skip tmdb_id={tmdb_id}: the CDN served nothing for {path}")
            continue
        if slices.get(tmdb_id) == fresh:
            print(f"  tmdb_id={tmdb_id} already current")
            continue
        print(f"  tmdb_id={tmdb_id} {slices.get(tmdb_id, '')[:12]!r} -> {fresh[:12]!r}")
        changed[tmdb_id] = fresh

    if not changed:
        print("nothing to do")
        return
    if not args.apply:
        print(f"{len(changed)} slice(s) stale — dry run, pass --apply to write")
        return

    slices.update(changed)
    write_slice_seed(SLICES, slices)
    print(f"wrote {len(changed)} slice(s) to {SLICES.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
