-- One row per candidate film (recommendation pool, not yet watched/rated).
-- Mirrors dim_film schema for uniform feature encoding.
select
    tmdb_id,
    imdb_id,
    -- Was hardcoded to '' because the seed carried no title, which shipped every
    -- recommendation with a runtime, a genre and a working Letterboxd link but no
    -- name. scripts/backfill_candidate_titles.py filled the column in.
    title,
    year(release_date) as release_year,
    runtime_min,
    genres,
    keywords,
    budget,
    revenue,
    director,
    actors,
    metascore,
    rt_rating,
    imdb_rating,
    imdb_votes,
    box_office,
    production_countries,
    rated,
    original_language,
    collection,
    poster_path
from {{ ref('stg_candidate_enrichment') }} c
where not exists (
    select 1 from {{ ref('dim_film') }} f where f.tmdb_id = c.tmdb_id
)
