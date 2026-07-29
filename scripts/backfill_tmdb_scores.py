"""Add `tmdb_rating` and `tmdb_votes` to candidate_enrichment.csv.

The seed's rating columns all come from OMDb — imdb_rating, metascore,
rt_rating, imdb_votes — and OMDb currently answers 401, so only 34 of the 136
watchlist films carry any of them. TMDB's own audience score is in the same
detail payload the seed is already built from, and covers 130 of the 136.

That difference is the whole reason for this column. A ratings chart drawn from
imdb_rating would describe a quarter of the list and imply it described all of
it.

Reads the cached detail payloads only — scripts/backfill_candidate_titles.py
already fetched every one of them, so this needs no network and no API key.

Usage:
    uv run python scripts/backfill_tmdb_scores.py           # preview
    uv run python scripts/backfill_tmdb_scores.py --apply   # rewrite seed
"""

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402

SEED = ROOT / "transform" / "seeds" / "candidate_enrichment.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

NEW_COLUMNS = ["tmdb_rating", "tmdb_votes"]


def _detail(tmdb_id: int) -> dict | None:
    path = CACHE / f"detail_{tmdb_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default: preview)")
    args = parser.parse_args()

    with SEED.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    fields = list(rows[0].keys()) if rows else []
    out_fields = fields + [c for c in NEW_COLUMNS if c not in fields]

    filled = 0
    for r in rows:
        try:
            tid = int(r["tmdb_id"])
        except (ValueError, KeyError, TypeError):
            r["tmdb_rating"] = ""
            r["tmdb_votes"] = ""
            continue
        d = _detail(tid) or {}
        # A film TMDB holds but nobody has voted on reports 0.0, which is not a
        # score — it is the absence of one, and binning it as half a star would
        # invent an opinion. Blank instead.
        avg = d.get("vote_average") or 0
        votes = d.get("vote_count") or 0
        r["tmdb_rating"] = f"{avg:.1f}" if avg and votes else ""
        r["tmdb_votes"] = str(votes) if votes else ""
        if r["tmdb_rating"]:
            filled += 1

    print(f"rows        : {len(rows)}")
    print(f"with a score: {filled}")
    print(f"blank       : {len(rows) - filled}")

    if not args.apply:
        print("\nDRY RUN — no seed written. Re-run with --apply.")
        return 0

    with SEED.open("w", encoding="utf-8", newline="") as fh:
        w = dict_writer(fh, out_fields)
        w.writeheader()
        w.writerows(rows)
    print(f"\nwrote {SEED.name} with {', '.join(NEW_COLUMNS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
