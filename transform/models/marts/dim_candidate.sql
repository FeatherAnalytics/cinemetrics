-- One row per candidate film (recommendation pool, not yet watched/rated).
-- Mirrors dim_film schema for uniform feature encoding.
select
    tmdb_id,
    imdb_id,
    '' as title,
    null as release_year,
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
    collection
from {{ ref('stg_candidate_enrichment') }}
where tmdb_id not in (select tmdb_id from {{ ref('dim_film') }})
