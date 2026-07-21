"""Enrich films with critic data via the OMDb API, keyed by imdb_id.

OMDb covers every film (historical and future) at ~100% by id. It is the source
of Metascore, Rotten Tomatoes, IMDb rating/votes, box office, director, and cast.
Responses are cached to data/raw/omdb/.

Needs OMDB_API_KEY in the environment (see .env.example).
"""

import json
import os
import re
import time

import pandas as pd
import requests
from dotenv import load_dotenv

from ingest import DATA_RAW, connect

load_dotenv()

KEY = os.environ.get("OMDB_API_KEY")
CACHE = DATA_RAW / "omdb"


def _na(v: str | None) -> str | None:
    return None if not v or v == "N/A" else v


def _int(v: str | None) -> int | None:
    v = _na(v)
    return int(re.sub(r"[^0-9]", "", v)) if v and re.search(r"\d", v) else None


def _float(v: str | None) -> float | None:
    v = _na(v)
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _fix(s: str | None) -> str | None:
    # OMDb double-encodes some accented names; repair when it yields valid UTF-8.
    if not s:
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _fetch(imdb_id: str) -> dict:
    cache_file = CACHE / f"{imdb_id}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    for attempt in range(5):
        try:
            resp = requests.get(
                "https://www.omdbapi.com/", params={"i": imdb_id, "apikey": KEY}, timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                cache_file.write_text(json.dumps(data), encoding="utf-8")
                return data
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {"Response": "False", "Error": "fetch failed"}


def load() -> None:
    if not KEY:
        raise SystemExit("OMDB_API_KEY not set. Add it to .env.")
    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute("CREATE SCHEMA IF NOT EXISTS raw")

    film_rows = con.execute(
        "SELECT DISTINCT imdb_id, tmdb_id FROM dim_film WHERE imdb_id <> ''"
    ).fetchall()
    print(f"enriching {len(film_rows)} films via OMDb ...")
    rows, misses = [], 0
    for i, (imdb_id, _tmdb_id) in enumerate(film_rows, 1):
        d = _fetch(imdb_id)
        if d.get("Response") != "True":
            misses += 1
            continue
        rt = None
        for r in d.get("Ratings", []):
            if r.get("Source") == "Rotten Tomatoes":
                rt = _int(r.get("Value"))
        rows.append(
            {
                "imdb_id": imdb_id,
                "metascore": _int(d.get("Metascore")),
                "rt_rating": rt,
                "imdb_rating": _float(d.get("imdbRating")),
                "imdb_votes": _int(d.get("imdbVotes")),
                "box_office": _int(d.get("BoxOffice")),
                "director": _fix(_na(d.get("Director"))),
                "actors": _fix(_na(d.get("Actors"))),
                "rated": _na(d.get("Rated")),
            }
        )
        if i % 100 == 0:
            print(f"  {i}/{len(film_rows)} ...")

    df = pd.DataFrame(rows)  # noqa: F841 -- read by DuckDB replacement scan below
    con.execute("CREATE OR REPLACE TABLE raw.omdb_films AS SELECT * FROM df")
    print(f"loaded raw.omdb_films: {len(rows)} enriched, {misses} not found")
    con.close()


if __name__ == "__main__":
    load()
