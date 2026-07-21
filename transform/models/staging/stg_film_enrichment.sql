-- One row per film, typed, from the enrichment seed: TMDB (genres, keywords,
-- runtime, budget, revenue) + OMDb (critic scores, box office, director, cast),
-- keyed by tmdb_id.
select
    try_cast(tmdb_id as integer)     as tmdb_id,
    imdb_id,
    genres,
    keywords,
    try_cast(runtime as integer)     as runtime_min,
    try_cast(budget as bigint)       as budget,
    try_cast(revenue as bigint)      as revenue,
    try_cast(metascore as integer)   as metascore,
    try_cast(rt_rating as integer)   as rt_rating,
    try_cast(imdb_rating as double)  as imdb_rating,
    try_cast(imdb_votes as integer)  as imdb_votes,
    try_cast(box_office as bigint)   as box_office,
    director,
    actors,
    rated,
    production_countries,
    original_language,
    collection
from {{ ref('film_enrichment') }}
where tmdb_id is not null
