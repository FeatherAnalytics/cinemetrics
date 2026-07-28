-- One row per film on the Letterboxd watchlist, keyed by tmdb_id: the list
-- itself from the watchlist seed, every attribute from the enrichment seeds.
--
-- SNAPSHOT, NOT HISTORY (inherited from stg_watchlist): the export records what
-- is on the list now plus the date each film was added. Removals are recorded
-- nowhere, so nothing that depends on films LEAVING the list can be derived
-- here -- no conversion rate, no time-to-watch.
--
-- Enrichment arrives from two seeds because a watchlist film can sit in either
-- pool. film_enrichment covers the handful already watched (see `watched`);
-- candidate_enrichment covers the rest, backfilled by scripts/enrich_watchlist.py.
-- film_enrichment wins where both have a row: it prefers OMDb for genres and
-- runtime, which is the same source dim_film reports, so a film that appears in
-- both marts does not describe itself two different ways.
with enrichment as (
    select
        tmdb_id,
        coalesce(f.imdb_id, c.imdb_id)                           as imdb_id,
        coalesce(f.genres, c.genres)                             as genres,
        coalesce(f.keywords, c.keywords)                         as keywords,
        coalesce(f.runtime_min, c.runtime_min)                   as runtime_min,
        coalesce(f.director, c.director)                         as director,
        coalesce(f.actors, c.actors)                             as actors,
        coalesce(f.rated, c.rated)                               as rated,
        coalesce(f.metascore, c.metascore)                       as metascore,
        coalesce(f.rt_rating, c.rt_rating)                       as rt_rating,
        coalesce(f.imdb_rating, c.imdb_rating)                   as imdb_rating,
        coalesce(f.imdb_votes, c.imdb_votes)                     as imdb_votes,
        coalesce(f.production_countries, c.production_countries) as production_countries,
        coalesce(f.original_language, c.original_language)       as original_language,
        coalesce(f.collection, c.collection)                     as collection
    from {{ ref('stg_film_enrichment') }} f
    full outer join {{ ref('stg_candidate_enrichment') }} c using (tmdb_id)
),

-- Films on the list that have nonetheless been watched. Letterboxd does not
-- remove a film from the watchlist when it is logged, and the reader does so
-- only inconsistently, so the list is NOT a clean unwatched set. Flagged rather
-- than filtered: dropping them would quietly disagree with the 136 the export
-- reports, and any chart that wants only the true backlog can filter on this.
watched_ids as (
    select distinct tmdb_id from {{ ref('fct_watches') }}
)

select
    w.tmdb_id,
    e.imdb_id,
    w.title,
    w.release_year,
    w.added_date,
    (v.tmdb_id is not null) as watched,
    e.genres,
    e.keywords,
    e.runtime_min,
    e.director,
    e.actors,
    e.rated,
    e.metascore,
    e.rt_rating,
    e.imdb_rating,
    e.imdb_votes,
    e.production_countries,
    e.original_language,
    e.collection
from {{ ref('stg_watchlist') }} w
left join enrichment e using (tmdb_id)
left join watched_ids v using (tmdb_id)
