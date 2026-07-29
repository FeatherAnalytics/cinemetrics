-- One row per candidate film (not yet rated), typed from the candidate
-- enrichment seed. Same schema as stg_film_enrichment.
select
    try_cast(tmdb_id as integer)     as tmdb_id,
    imdb_id,
    -- Canonicalised so both halves of the dataset name science fiction
    -- the same way; see macros/canonical_genres.sql.
    {{ canonical_genres('genres') }} as genres,
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
    collection,
    title,
    -- Empty for the few films TMDB serves no date for; try_cast keeps those NULL
    -- rather than failing the build.
    try_cast(release_date as date) as release_date,
    -- TMDB's own audience score, 0-10, and the votes behind it. Distinct from
    -- imdb_rating/imdb_votes, which come from OMDb and cover far less of the
    -- pool; see scripts/backfill_tmdb_scores.py.
    try_cast(tmdb_rating as double)  as tmdb_rating,
    try_cast(tmdb_votes as integer)  as tmdb_votes
from {{ ref('candidate_enrichment') }}
where tmdb_id is not null
