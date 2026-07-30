-- Fails when dim_film stops carrying poster art. The failure it was written for
-- is stg_film_enrichment handing dim_film a literal NULL instead of reading the
-- seed column, which empties the field for every film at once.
--
-- A not_null test cannot do this job: a film TMDB serves no poster for is
-- legitimately NULL. So the invariant is a share rather than a per-row rule.
--
-- Two thresholds, because they catch different failures:
--   * under 95% of films with a poster -- coverage rotting as films are added.
--     All 676 have one today, so 95% allows a handful of poster-less films.
--   * under 600 films with a poster -- the catalogue or the join itself gone.
--
-- The floor this replaced was `count(*) < 100` against those same 676, so it
-- passed with 576 of them missing.
select
    count(*)           as films,
    count(poster_path) as films_with_a_poster
from {{ ref('dim_film') }}
having count(poster_path) < 0.95 * count(*)
    or count(poster_path) < 600
