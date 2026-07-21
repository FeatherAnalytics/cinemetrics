"""One-time backfill: add tmdb_id to film_log.csv and reorder film_enrichment.csv.

film_enrichment.csv already has tmdb_id from TMDB enrichment. For film_log.csv,
look up each imdb_id in the enrichment data. For any missing, call TMDB API.
"""

import csv
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / "transform" / "seeds"
TMDB_CACHE = ROOT / "data" / "raw" / "tmdb"
TMDB_KEY = os.environ.get("TMDB_API_KEY", "")

LOG_PATH = SEEDS / "film_log.csv"
ENRICH_PATH = SEEDS / "film_enrichment.csv"

LOG_COLUMNS = [
    "watched_date",
    "tmdb_id",
    "imdb_id",
    "title",
    "release_year",
    "my_rating",
    "star_rating",
    "is_rewatch",
]

ENRICH_COLUMNS = [
    "tmdb_id",
    "imdb_id",
    "genres",
    "keywords",
    "runtime",
    "budget",
    "revenue",
    "metascore",
    "rt_rating",
    "imdb_rating",
    "imdb_votes",
    "box_office",
    "director",
    "actors",
    "rated",
]


def _tmdb_find(imdb_id: str) -> int | None:
    """Look up tmdb_id for an imdb_id via TMDB /find endpoint."""
    if not TMDB_KEY:
        return None
    for attempt in range(4):
        try:
            resp = requests.get(
                f"https://api.themoviedb.org/3/find/{imdb_id}",
                params={"api_key": TMDB_KEY, "external_source": "imdb_id"},
                timeout=30,
            )
            if resp.status_code == 200:
                results = resp.json().get("movie_results", [])
                if results:
                    return results[0]["id"]
                return None
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return None


def _read_cache(imdb_id: str) -> int | None:
    """Read tmdb_id from existing TMDB cache file."""
    cache_file = TMDB_CACHE / f"{imdb_id}.json"
    if not cache_file.exists():
        return None
    try:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        tid = data.get("id")
        return int(tid) if tid else None
    except (json.JSONDecodeError, ValueError):
        return None


def build_imdb_to_tmdb_map() -> dict[str, str]:
    """Build imdb_id -> tmdb_id mapping from enrichment CSV + cache + API."""
    mapping: dict[str, str] = {}

    # 1. Read from enrichment CSV
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            imdb_id = row["imdb_id"]
            tmdb_id = row.get("tmdb_id", "").strip()
            if tmdb_id:
                mapping[imdb_id] = tmdb_id

    # 2. Collect imdb_ids from film_log that still need tmdb_id
    needed: set[str] = set()
    with open(LOG_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            iid = row["imdb_id"]
            if iid not in mapping:
                needed.add(iid)

    if not needed:
        return mapping

    print(f"  {len(needed)} imdb_ids need tmdb_id lookup")

    # 3. Try cache files
    still_needed: list[str] = []
    for iid in sorted(needed):
        tid = _read_cache(iid)
        if tid:
            mapping[iid] = str(tid)
        else:
            still_needed.append(iid)

    if still_needed:
        print(f"  {len(still_needed)} need API call")
        if not TMDB_KEY:
            print("  WARNING: TMDB_API_KEY not set, cannot resolve remaining IDs")
            return mapping
        for i, iid in enumerate(still_needed, 1):
            tid = _tmdb_find(iid)
            if tid:
                mapping[iid] = str(tid)
            else:
                print(f"  WARNING: no tmdb_id found for {iid}")
            if i % 50 == 0:
                print(f"    {i}/{len(still_needed)} ...")

    return mapping


def backfill_log(mapping: dict[str, str]) -> int:
    """Rewrite film_log.csv with tmdb_id column."""
    rows: list[dict[str, str]] = []
    missing = 0
    with open(LOG_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tmdb_id = mapping.get(row["imdb_id"], "")
            if not tmdb_id:
                missing += 1
            row["tmdb_id"] = tmdb_id
            rows.append(row)

    with open(LOG_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"  film_log.csv: {len(rows)} rows, {missing} missing tmdb_id")
    return len(rows)


def backfill_enrichment() -> int:
    """Rewrite film_enrichment.csv with tmdb_id as first column."""
    rows: list[dict[str, str]] = []
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    with open(ENRICH_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ENRICH_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"  film_enrichment.csv: {len(rows)} rows reordered")
    return len(rows)


def main() -> None:
    print("Building imdb_id -> tmdb_id mapping ...")
    mapping = build_imdb_to_tmdb_map()
    print(f"  mapped {len(mapping)} imdb_ids to tmdb_ids")

    print("Backfilling film_log.csv ...")
    backfill_log(mapping)

    print("Reordering film_enrichment.csv ...")
    backfill_enrichment()

    print("Done.")


if __name__ == "__main__":
    sys.exit(main() or 0)
