-- One row per film, keyed by tmdb_id: title/year from the ratings log, all
-- attributes from the enrichment seed (TMDB + OMDb).
with films as (
    select
        tmdb_id,
        any_value(imdb_id)      as imdb_id,
        any_value(title)        as title,
        any_value(release_year) as release_year,
        -- Film-level like, for the recommender. The heart is ALREADY film-level
        -- upstream: Letterboxd stamps one toggle onto every diary entry for a
        -- film, so every non-null row for a tmdb_id carries the same value and
        -- this aggregate never actually has to choose between two of them.
        --
        -- bool_or stays because it handles the case that does vary, which is
        -- whether the heart was recorded at all: it ignores NULLs and returns
        -- NULL only when every watch is unknown. So a film with one Letterboxd
        -- watch and three pre-Letterboxd ones takes the known value rather than
        -- being dragged to unknown, and pre-Letterboxd-only -> null.
        bool_or(liked)          as liked
    from {{ ref('stg_film_log') }}
    group by tmdb_id
),

-- franchise_mapping() rolls TMDB's per-sub-series collections up into umbrella
-- franchises (e.g. eight Marvel collections -> MCU). Rules keyed by
-- collection_name remap every film in that collection; rules keyed by tmdb_id
-- catch films TMDB left out of any collection (e.g. Black Widow); rules keyed
-- by director group an auteur's films (e.g. Miyazaki) and auto-catch future
-- watches. Precedence: film > collection > director.
franchise_rules as (
    select * from {{ franchise_mapping() }}
),

franchise_by_film as (
    select tmdb_id, franchise
    from franchise_rules
    where tmdb_id is not null
),

franchise_by_collection as (
    select collection_name, franchise
    from franchise_rules
    where collection_name is not null
),

franchise_by_director as (
    select director, franchise
    from franchise_rules
    where director is not null
)

select
    f.tmdb_id,
    f.imdb_id,
    f.title,
    f.release_year,
    f.liked,
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
    e.poster_path,
    ps.poster_slice,
    -- The umbrella franchise when mapped, the raw TMDB collection otherwise.
    -- Kept under the `collection` name because it is the grouping the site
    -- exposes as "franchise runs".
    coalesce(ff.franchise, fc.franchise, fd.franchise, e.collection) as collection
from films f
left join {{ ref('stg_film_enrichment') }} e using (tmdb_id)
left join franchise_by_film ff using (tmdb_id)
left join franchise_by_collection fc on e.collection = fc.collection_name
left join franchise_by_director fd on contains(coalesce(e.director, ''), fd.director)
left join {{ ref('stg_poster_slices') }} ps using (tmdb_id)
