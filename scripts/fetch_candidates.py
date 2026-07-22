"""Fetch candidate films from TMDB for the recommendation pool.

Two sources:
1. TMDB /movie/{id}/similar for each rated film (taste graph)
2. TMDB /movie/popular and /movie/top_rated (broad backfill)

Deduplicates against existing film_enrichment.csv and candidate_enrichment.csv.
Enriches new candidates via TMDB + OMDb and appends to candidate_enrichment.csv.
"""

import csv
import json
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / "transform" / "seeds"
FILM_ENRICHMENT = SEEDS / "film_enrichment.csv"
CANDIDATE_ENRICHMENT = SEEDS / "candidate_enrichment.csv"
CACHE = ROOT / "data" / "raw" / "tmdb_candidates"

TMDB_KEY = os.environ.get("TMDB_API_KEY")
OMDB_KEY = os.environ.get("OMDB_API_KEY")


def _tmdb_get(path: str, **params) -> dict:
    params["api_key"] = TMDB_KEY
    for attempt in range(4):
        try:
            resp = requests.get(
                f"https://api.themoviedb.org/3/{path}", params=params, timeout=30
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429:
                time.sleep(2 + attempt)
                continue
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


def _omdb_get(imdb_id: str) -> dict:
    cache_file = ROOT / "data" / "raw" / "omdb" / f"{imdb_id}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            resp = requests.get(
                "https://www.omdbapi.com/",
                params={"i": imdb_id, "apikey": OMDB_KEY},
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                cache_file.write_text(json.dumps(data), encoding="utf-8")
                return data
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


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
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    data = _tmdb_get(f"movie/{tmdb_id}/similar", page=1)
    ids = [m["id"] for m in data.get("results", [])]
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(ids), encoding="utf-8")
    return ids


def _fetch_list(endpoint: str, pages: int = 50) -> list[int]:
    ids: list[int] = []
    for page in range(1, pages + 1):
        data = _tmdb_get(endpoint, page=page)
        ids.extend(m["id"] for m in data.get("results", []))
        if page >= data.get("total_pages", 1):
            break
    return ids


def _na(v: str | None) -> str:
    return "" if not v or v == "N/A" else v


def _int_or_empty(v: str | None) -> str:
    v2 = _na(v)
    if not v2:
        return ""
    digits = re.sub(r"[^0-9]", "", v2)
    return digits if digits else ""


def _float_or_empty(v: str | None) -> str:
    v2 = _na(v)
    try:
        return str(float(v2)) if v2 else ""
    except ValueError:
        return ""


def _enrich_tmdb(tmdb_id: int) -> dict | None:
    cache_file = CACHE / f"detail_{tmdb_id}.json"
    if cache_file.exists():
        data = json.loads(cache_file.read_text(encoding="utf-8"))
    else:
        data = _tmdb_get(f"movie/{tmdb_id}", append_to_response="keywords")
        if not data.get("id"):
            return None
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data), encoding="utf-8")

    imdb_id = data.get("imdb_id", "")
    omdb = _omdb_get(imdb_id) if imdb_id else {}

    rt = ""
    for r in omdb.get("Ratings", []):
        if r.get("Source") == "Rotten Tomatoes":
            rt = _int_or_empty(r.get("Value"))

    countries = ", ".join(c["iso_3166_1"] for c in data.get("production_countries", []))

    return {
        "tmdb_id": str(tmdb_id),
        "imdb_id": imdb_id,
        "genres": ", ".join(g["name"] for g in data.get("genres", [])),
        "keywords": ", ".join(
            k["name"] for k in data.get("keywords", {}).get("keywords", [])
        ),
        "runtime": str(data.get("runtime") or ""),
        "budget": str(data.get("budget") or ""),
        "revenue": str(data.get("revenue") or ""),
        "metascore": _int_or_empty(omdb.get("Metascore")),
        "rt_rating": rt,
        "imdb_rating": _float_or_empty(omdb.get("imdbRating")),
        "imdb_votes": _int_or_empty(omdb.get("imdbVotes")),
        "box_office": _int_or_empty(omdb.get("BoxOffice")),
        "director": _na(omdb.get("Director")),
        "actors": _na(omdb.get("Actors")),
        "rated": _na(omdb.get("Rated")),
        "production_countries": countries,
        "original_language": data.get("original_language", ""),
        "collection": (data.get("belongs_to_collection") or {}).get("name", ""),
    }


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
