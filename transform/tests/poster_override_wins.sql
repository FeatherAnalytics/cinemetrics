-- Every curated override must be the poster dim_film actually serves.
--
-- The coalesce in dim_film is the whole mechanism: reverse its arguments and the
-- enrichment seed's default silently wins again, which is exactly the state this
-- seed was built to end. Nothing downstream would fail, because a valid poster
-- path is still served -- just the wrong one. So the mart has to be asked.
--
-- An override row for a film the library does not hold is caught too. That is
-- dead configuration rather than a wrong picture, but it is always a mistake:
-- the id was mistyped, or the film was never watched.
select
    o.tmdb_id,
    o.poster_path as curated,
    f.poster_path as served
from {{ ref('stg_poster_overrides') }} o
left join {{ ref('dim_film') }} f using (tmdb_id)
where f.tmdb_id is null
    or f.poster_path is distinct from o.poster_path
