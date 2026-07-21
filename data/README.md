# Data sources

The data source is **Letterboxd**. Films are enriched by IMDb id via two public APIs.
`data/movies.duckdb` is a build artifact (gitignored); the committed inputs are the two
seed files under `transform/seeds/`.

## 1. Ratings log — `transform/seeds/film_log.csv`

One row per watch: `watched_date, imdb_id, title, release_year, my_rating, star_rating,
is_rewatch`. This is the consolidated personal history (early years plus Letterboxd). New
watches are appended from the Letterboxd RSS feed (`https://letterboxd.com/<user>/rss/`),
which conveniently carries the TMDB id for each film.

## 2. Film enrichment — `transform/seeds/film_enrichment.csv`

One row per film, keyed by imdb id, regenerated from two APIs:

| Source | Fields |
|--------|--------|
| **TMDB** (`ingest/tmdb.py`) | tmdb_id, genres, keywords, runtime, budget, revenue |
| **OMDb** (`ingest/omdb.py`) | metascore, rt_rating, imdb_rating, imdb_votes, box_office, director, actors, rated |

TMDB resolves the id and gives thematic data; OMDb gives critic scores and cast. Both cover
~100% of films by id, so there is no manual matching. API responses are cached under
`data/raw/`. Keys go in `.env` (see `.env.example`).

## Rebuild

```
cd transform && uv run dbt build --profiles-dir .   # seeds -> staging -> marts (+ tests)
uv run python scripts/export_web.py                 # marts -> web/public/data/cinemetrics.json
```
