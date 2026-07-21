"""Full auto-update: RSS -> enrich new films -> dbt build -> export JSON."""

import csv
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.geo import names_to_iso  # noqa: E402

SEEDS = ROOT / "transform" / "seeds"
TRANSFORM = ROOT / "transform"
LOG_PATH = SEEDS / "film_log.csv"
ENRICH_PATH = SEEDS / "film_enrichment.csv"

TMDB_KEY = os.environ.get("TMDB_API_KEY", "")
OMDB_KEY = os.environ.get("OMDB_API_KEY", "")
LETTERBOXD_USER = os.environ.get("LETTERBOXD_USER", "")

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
    "production_countries",
]


def _tmdb_get(path: str, **params: str) -> dict:
    params["api_key"] = TMDB_KEY
    for attempt in range(4):
        try:
            resp = requests.get(
                f"https://api.themoviedb.org/3/{path}", params=params, timeout=30
            )
            if resp.status_code == 200:
                return resp.json()
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


def _omdb_get(imdb_id: str) -> dict:
    for attempt in range(4):
        try:
            resp = requests.get(
                "https://www.omdbapi.com/",
                params={"i": imdb_id, "apikey": OMDB_KEY},
                timeout=30,
            )
            if resp.status_code == 200:
                return resp.json()
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


def _na(v: str | None) -> str | None:
    return None if not v or v == "N/A" else v


def _int_or_empty(v: str | None) -> str:
    v = _na(v)
    if not v:
        return ""
    digits = re.sub(r"[^0-9]", "", v)
    return digits if digits else ""


def _float_or_empty(v: str | None) -> str:
    v = _na(v)
    if not v:
        return ""
    try:
        return str(float(v))
    except ValueError:
        return ""


def _existing_enrichment_tmdb_ids() -> set[str]:
    ids: set[str] = set()
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid = row.get("tmdb_id", "").strip()
            if tid:
                ids.add(tid)
    return ids


def enrich_film(tmdb_id: str) -> dict[str, str]:
    """Fetch TMDB + OMDb data for a single film, return enrichment row."""
    movie = _tmdb_get(f"movie/{tmdb_id}", append_to_response="keywords")
    ext = _tmdb_get(f"movie/{tmdb_id}/external_ids")
    imdb_id = ext.get("imdb_id", "")

    # TMDB is kept for the fields OMDb lacks (keywords, budget, revenue) and as a
    # fallback for genres/runtime/countries.
    t_genres = ", ".join(g["name"] for g in movie.get("genres", []))
    kw_list = movie.get("keywords", {}).get("keywords", [])
    keywords = ", ".join(k["name"] for k in kw_list)
    t_countries = ", ".join(
        c["iso_3166_1"] for c in movie.get("production_countries", []) if c.get("iso_3166_1")
    )

    # OMDb is preferred for everything it reports.
    omdb: dict = _omdb_get(imdb_id) if imdb_id and OMDB_KEY else {}
    if omdb.get("Response") != "True":
        omdb = {}
    rt = ""
    for r in omdb.get("Ratings", []):
        if r.get("Source") == "Rotten Tomatoes":
            rt = _int_or_empty(r.get("Value"))
    countries = names_to_iso(omdb.get("Country", "")) or (
        t_countries.split(", ") if t_countries else []
    )

    row: dict[str, str] = {
        "tmdb_id": tmdb_id,
        "imdb_id": imdb_id,
        "genres": _na(omdb.get("Genre")) or t_genres,
        "keywords": keywords,
        "runtime": _int_or_empty(omdb.get("Runtime"))
        or (str(movie.get("runtime", "")) if movie.get("runtime") else ""),
        "budget": str(movie.get("budget", "")) if movie.get("budget") else "",
        "revenue": str(movie.get("revenue", "")) if movie.get("revenue") else "",
        "metascore": _int_or_empty(omdb.get("Metascore")),
        "rt_rating": rt,
        "imdb_rating": _float_or_empty(omdb.get("imdbRating")),
        "imdb_votes": _int_or_empty(omdb.get("imdbVotes")),
        "box_office": _int_or_empty(omdb.get("BoxOffice")),
        "director": _na(omdb.get("Director")) or "",
        "actors": _na(omdb.get("Actors")) or "",
        "rated": _na(omdb.get("Rated")) or "",
        "production_countries": ", ".join(countries),
    }

    return row


def append_to_enrichment(rows: list[dict[str, str]]) -> None:
    with open(ENRICH_PATH, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ENRICH_COLUMNS, extrasaction="ignore")
        writer.writerows(rows)


def append_to_log(watches: list[dict]) -> None:
    with open(LOG_PATH, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_COLUMNS, extrasaction="ignore")
        writer.writerows(watches)


def main() -> None:
    if not LETTERBOXD_USER:
        raise SystemExit("LETTERBOXD_USER not set in .env")
    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set in .env")

    # Import here to avoid circular issues at module level
    sys.path.insert(0, str(ROOT))
    from ingest.letterboxd import fetch_new_watches

    print(f"Fetching RSS for {LETTERBOXD_USER} ...")
    new_watches = fetch_new_watches(LETTERBOXD_USER, LOG_PATH)

    if not new_watches:
        print("No new watches found.")
        return

    if len(new_watches) > 50:
        print(f"WARNING: {len(new_watches)} new watches detected. Possible parse error. Aborting.")
        sys.exit(1)

    print(f"Found {len(new_watches)} new watches.")

    # Enrich new films
    existing_tmdb = _existing_enrichment_tmdb_ids()
    new_films: list[dict[str, str]] = []
    new_tmdb_ids = {w["tmdb_id"] for w in new_watches} - existing_tmdb

    for tid in sorted(new_tmdb_ids):
        print(f"  Enriching tmdb_id={tid} ...")
        row = enrich_film(tid)
        new_films.append(row)
        # Populate imdb_id back into watches that need it
        for w in new_watches:
            if w["tmdb_id"] == tid and not w.get("imdb_id"):
                w["imdb_id"] = row.get("imdb_id", "")

    if new_films:
        append_to_enrichment(new_films)

    # Ensure all watches have imdb_id from enrichment
    enrich_imdb: dict[str, str] = {}
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            enrich_imdb[row.get("tmdb_id", "")] = row.get("imdb_id", "")
    for w in new_watches:
        if not w.get("imdb_id"):
            w["imdb_id"] = enrich_imdb.get(w["tmdb_id"], "")

    append_to_log(new_watches)

    # dbt build
    print("Running dbt build ...")
    subprocess.run(
        ["uv", "run", "dbt", "build", "--profiles-dir", "."],
        cwd=str(TRANSFORM),
        check=True,
    )

    # Export JSON
    print("Exporting web JSON ...")
    subprocess.run(
        ["uv", "run", "python", "scripts/export_web.py"],
        cwd=str(ROOT),
        check=True,
    )

    print(f"Added {len(new_watches)} watches, {len(new_films)} new films.")


if __name__ == "__main__":
    main()
