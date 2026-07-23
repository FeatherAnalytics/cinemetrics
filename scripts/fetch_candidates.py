"""Fetch candidate films from TMDB for the recommendation pool.

Two sources:
1. TMDB /movie/{id}/similar for each rated film (taste graph)
2. TMDB /movie/popular and /movie/top_rated (broad backfill)

Deduplicates against existing film_enrichment.csv and candidate_enrichment.csv.
Enriches new candidates via TMDB + OMDb and appends to candidate_enrichment.csv.
"""

import csv
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.enrich import build_enrichment_row  # noqa: E402
from ingest.http import cached_json, omdb_get, tmdb_get  # noqa: E402

SEEDS = ROOT / "transform" / "seeds"
FILM_ENRICHMENT = SEEDS / "film_enrichment.csv"
CANDIDATE_ENRICHMENT = SEEDS / "candidate_enrichment.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

TMDB_KEY = os.environ.get("TMDB_API_KEY")
OMDB_KEY = os.environ.get("OMDB_API_KEY")


def _tmdb_get(path: str, **params) -> dict:
    return tmdb_get(path, api_key=TMDB_KEY, **params)


def _omdb_get(imdb_id: str) -> dict:
    cache_file = ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json"
    return cached_json(
        cache_file,
        lambda: omdb_get(imdb_id, api_key=OMDB_KEY),
        is_valid=lambda d: bool(d),
    )


def _existing_tmdb_ids() -> set[int]:
    ids: set[int] = set()
    for path in [FILM_ENRICHMENT, CANDIDATE_ENRICHMENT]:
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                try:
                    ids.add(int(row["tmdb_id"]))
                except (ValueError, KeyError):
                    pass
    return ids


def _fetch_similar(tmdb_id: int) -> list[int]:
    cache_file = CACHE / f"similar_{tmdb_id}.json"

    def produce() -> list[int]:
        data = _tmdb_get(f"movie/{tmdb_id}/similar", page=1)
        return [m["id"] for m in data.get("results", [])]

    # Only cache a genuine non-empty result; an empty/failed response would
    # otherwise poison the cache permanently.
    return cached_json(cache_file, produce, is_valid=lambda ids: len(ids) > 0)


def _fetch_list(endpoint: str, pages: int = 50) -> list[int]:
    ids: list[int] = []
    for page in range(1, pages + 1):
        data = _tmdb_get(endpoint, page=page)
        ids.extend(m["id"] for m in data.get("results", []))
        if page >= data.get("total_pages", 1):
            break
    return ids


def _enrich_tmdb(tmdb_id: int) -> dict | None:
    cache_file = CACHE / f"detail_{tmdb_id}.json"
    # Only cache a real hit (data with an id); a failed lookup must not be cached.
    data = cached_json(
        cache_file,
        lambda: _tmdb_get(f"movie/{tmdb_id}", append_to_response="keywords"),
        is_valid=lambda d: bool(d.get("id")),
    )
    if not data.get("id"):
        return None

    imdb_id = data.get("imdb_id", "")
    omdb = _omdb_get(imdb_id) if imdb_id else {}

    return build_enrichment_row(
        data,
        omdb,
        tmdb_id=str(tmdb_id),
        imdb_id=imdb_id,
        prefer_omdb=False,
        omdb_countries=False,
        include_lang_collection=True,
    )


FIELDNAMES = [
    "tmdb_id", "imdb_id", "genres", "keywords", "runtime", "budget", "revenue",
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated", "production_countries", "original_language",
    "collection",
]


def main() -> None:
    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set")
    if not OMDB_KEY:
        raise SystemExit("OMDB_API_KEY not set")

    existing = _existing_tmdb_ids()
    print(f"existing films: {len(existing)}")

    rated_ids = set()
    with open(FILM_ENRICHMENT, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                rated_ids.add(int(row["tmdb_id"]))
            except (ValueError, KeyError):
                pass

    candidate_ids: set[int] = set()
    print(f"fetching similar films for {len(rated_ids)} rated films...")
    for i, tid in enumerate(sorted(rated_ids), 1):
        similar = _fetch_similar(tid)
        candidate_ids.update(similar)
        if i % 100 == 0:
            print(f"  {i}/{len(rated_ids)} rated films processed...")

    print("fetching popular + top-rated lists...")
    candidate_ids.update(_fetch_list("movie/popular", pages=50))
    candidate_ids.update(_fetch_list("movie/top_rated", pages=50))

    new_ids = candidate_ids - existing
    print(f"candidates: {len(candidate_ids)} total, {len(new_ids)} new to enrich")

    if not new_ids:
        print("no new candidates to enrich")
        return

    write_header = not CANDIDATE_ENRICHMENT.exists()
    enriched = 0
    with open(CANDIDATE_ENRICHMENT, "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        for i, tid in enumerate(sorted(new_ids), 1):
            row = _enrich_tmdb(tid)
            if row:
                writer.writerow(row)
                enriched += 1
            if i % 100 == 0:
                print(f"  enriched {i}/{len(new_ids)}...")

    print(f"done: {enriched} new candidates appended to {CANDIDATE_ENRICHMENT.name}")


if __name__ == "__main__":
    main()
