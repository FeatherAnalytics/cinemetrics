-- One row per film, keyed by tmdb_id: title/year from the ratings log, all
-- attributes from the enrichment seed (TMDB + OMDb).
with films as (
    select
        tmdb_id,
        any_value(imdb_id)      as imdb_id,
        any_value(title)        as title,
        any_value(release_year) as release_year
    from {{ ref('stg_film_log') }}
    group by tmdb_id
)

select
    f.tmdb_id,
    f.imdb_id,
    f.title,
    f.release_year,
    e.runtime_min,
    e.genres,
    e.keywords,
    e.budget,
    e.revenue,
    e.director,
    e.actors,
    e.metascore,
    e.rt_rating,
    e.imdb_rating,
    e.imdb_votes,
    e.box_office,
    e.production_countries,
    e.rated,
    e.original_language,
    e.collection
from films f
left join {{ ref('stg_film_enrichment') }} e using (tmdb_id)
