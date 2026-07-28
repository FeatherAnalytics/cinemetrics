"""Add `title` and `release_date` to candidate_enrichment.csv.

The seed never carried either, so dim_candidate hardcoded `'' as title` and
every recommendation rendered with its runtime, genres and a working Letterboxd
link but no name. The link worked because it resolves through imdb_id, which the
seed does have — which is why the gap survived into production.

`release_date` comes along because it is in the same TMDB payload and the
watchlist barcode wants real dates rather than years: a year alone puts every
1978 film at one x position.

Most detail payloads are already cached under data/raw/tmdb_candidates, so this
only hits the network for the remainder. Rows whose film TMDB no longer serves
keep an empty title and are left in place — dropping them would silently shrink
the recommendation pool.

Usage:
    uv run python scripts/backfill_candidate_titles.py           # preview
    uv run python scripts/backfill_candidate_titles.py --apply   # rewrite seed
"""

import argparse
import csv
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402
from ingest.http import cached_json, tmdb_get  # noqa: E402

SEED = ROOT / "transform" / "seeds" / "candidate_enrichment.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

TMDB_KEY = os.environ.get("TMDB_API_KEY")
MAX_WORKERS = int(os.environ.get("TMDB_MAX_WORKERS", "8"))

# Appended after the existing columns so the diff stays readable and any reader
# keying on position rather than header is unaffected.
NEW_COLUMNS = ["title", "release_date"]


def _cached_detail(tmdb_id: int) -> dict | None:
    """Read a detail payload from disk only. No network."""
    path = CACHE / f"detail_{tmdb_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _fetch_detail(tmdb_id: int) -> dict | None:
    """Fetch (and cache) a detail payload. Returns None if TMDB has no record."""
    data = cached_json(
        CACHE / f"detail_{tmdb_id}.json",
        lambda: tmdb_get(f"movie/{tmdb_id}", api_key=TMDB_KEY, append_to_response="keywords"),
        is_valid=lambda d: bool(d.get("id")),
    )
    return data if data.get("id") else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default: preview)")
    args = parser.parse_args()

    with SEED.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys()) if rows else []

    have_cols = all(c in fields for c in NEW_COLUMNS)
    out_fields = fields if have_cols else fields + NEW_COLUMNS

    ids = []
    for r in rows:
        try:
            ids.append(int(r["tmdb_id"]))
        except (ValueError, KeyError, TypeError):
            ids.append(None)

    cached = {i: _cached_detail(i) for i in ids if i is not None}
    missing = sorted(i for i, d in cached.items() if d is None)

    print(f"rows        : {len(rows)}")
    print(f"from cache  : {sum(1 for d in cached.values() if d)}")
    print(f"need fetch  : {len(missing)}")

    if not args.apply:
        print("\nDRY RUN — no seed written. Re-run with --apply.")
        return 0

    if missing:
        if not TMDB_KEY:
            raise SystemExit("TMDB_API_KEY not set")
        print(f"\nfetching {len(missing)} details ({MAX_WORKERS} workers)...")
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(_fetch_detail, i): i for i in missing}
            for done, fut in enumerate(as_completed(futures), 1):
                tid = futures[fut]
                try:
                    cached[tid] = fut.result()
                except Exception as err:  # noqa: BLE001 - one bad film must not stop the batch
                    print(f"  warning: {tid}: {err}")
                    cached[tid] = None
                if done % 250 == 0:
                    print(f"  {done}/{len(missing)}...", flush=True)

    filled = 0
    for r, tid in zip(rows, ids, strict=True):
        d = cached.get(tid) if tid is not None else None
        r["title"] = (d or {}).get("title") or (d or {}).get("original_title") or ""
        r["release_date"] = (d or {}).get("release_date") or ""
        if r["title"]:
            filled += 1

    with SEED.open("w", encoding="utf-8", newline="") as fh:
        w = dict_writer(fh, out_fields)
        w.writeheader()
        w.writerows(rows)

    print(f"\nwrote {SEED.name}: {filled}/{len(rows)} rows have a title")
    blank = len(rows) - filled
    if blank:
        print(f"{blank} rows left titleless (TMDB serves no record for them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
