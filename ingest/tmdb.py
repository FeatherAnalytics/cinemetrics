"""Enrich films with TMDB data, keyed by tmdb_id.

Fetches genres, keywords, runtime, budget, and revenue directly via
/movie/{tmdb_id}. Falls back to /find for rows that only have imdb_id.
Responses are cached to data/raw/tmdb/.

Needs TMDB_API_KEY in the environment (see .env.example).
"""

import json
import os

import pandas as pd
from dotenv import load_dotenv

from ingest import DATA_RAW, connect
from ingest.http import tmdb_get

load_dotenv()

KEY = os.environ.get("TMDB_API_KEY")
CACHE = DATA_RAW / "tmdb"


def _get(path: str, **params) -> dict:
    return tmdb_get(path, api_key=KEY, **params)


def _fetch(tmdb_id: int, imdb_id: str = "") -> dict:
    # Check cache by imdb_id first (backward compat), then by tmdb_id
    cache_imdb = CACHE / f"{imdb_id}.json" if imdb_id else None
    cache_tmdb = CACHE / f"tmdb_{tmdb_id}.json"

    if cache_imdb and cache_imdb.exists():
        return json.loads(cache_imdb.read_text(encoding="utf-8"))
    if cache_tmdb.exists():
        return json.loads(cache_tmdb.read_text(encoding="utf-8"))

    movie = _get(f"movie/{tmdb_id}", append_to_response="keywords")
    # Cache by imdb_id if available for backward compat, otherwise by tmdb_id.
    # Only cache a genuine hit; an empty/failed response must not poison cache.
    if movie.get("id"):
        dest = cache_imdb if imdb_id else cache_tmdb
        dest.write_text(json.dumps(movie), encoding="utf-8")
    return movie


def load() -> None:
    if not KEY:
        raise SystemExit("TMDB_API_KEY not set. Add it to .env.")
    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute("CREATE SCHEMA IF NOT EXISTS raw")

    sql = "SELECT DISTINCT tmdb_id, imdb_id FROM dim_film WHERE tmdb_id IS NOT NULL"
    film_rows = con.execute(sql).fetchall()
    print(f"enriching {len(film_rows)} films via TMDB ...")
    rows, misses = [], 0
    for i, (tmdb_id, imdb_id) in enumerate(film_rows, 1):
        m = _fetch(int(tmdb_id), imdb_id or "")
        if not m.get("id"):
            misses += 1
            continue
        rows.append(
            {
                "tmdb_id": m["id"],
                "imdb_id": imdb_id or "",
                "genres": ", ".join(g["name"] for g in m.get("genres", [])),
                "keywords": ", ".join(k["name"] for k in m.get("keywords", {}).get("keywords", [])),
                "runtime": m.get("runtime"),
                "budget": m.get("budget"),
                "revenue": m.get("revenue"),
            }
        )
        if i % 100 == 0:
            print(f"  {i}/{len(film_rows)} ...")

    df = pd.DataFrame(rows)  # noqa: F841 -- read by DuckDB replacement scan below
    con.execute("CREATE OR REPLACE TABLE raw.tmdb_films AS SELECT * FROM df")
    print(f"loaded raw.tmdb_films: {len(rows)} enriched, {misses} not found")
    con.close()


if __name__ == "__main__":
    load()
