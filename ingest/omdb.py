"""Enrich films with critic data via the OMDb API, keyed by imdb_id.

OMDb covers every film (historical and future) at ~100% by id. It is the source
of Metascore, Rotten Tomatoes, IMDb rating/votes, box office, director, and cast.
Responses are cached to data/raw/omdb/.

Needs OMDB_API_KEY in the environment (see .env.example).
"""

import os

import pandas as pd
from dotenv import load_dotenv

from ingest import DATA_RAW, connect
from ingest.http import cached_json, omdb_get
from ingest.parse import float_or_none, int_or_none, na_none

load_dotenv()

KEY = os.environ.get("OMDB_API_KEY")
CACHE = DATA_RAW / "omdb"

# Backwards-compatible aliases for the previously module-private helpers.
_na = na_none
_int = int_or_none
_float = float_or_none


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
    # Cache any real response (including OMDb's own {"Response":"False"}); a
    # total fetch failure returns {} and is not cached (falls through to the
    # sentinel so load() counts it as a miss).
    data = cached_json(
        cache_file,
        lambda: omdb_get(imdb_id, api_key=KEY),
        is_valid=lambda d: bool(d),
    )
    return data or {"Response": "False", "Error": "fetch failed"}


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
