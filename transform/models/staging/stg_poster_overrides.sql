-- One row per film whose preferred poster is not the one TMDB serves by default.
-- Hand curated, so it is a seed rather than something a query could produce: no
-- attribute in the data says which of a film's twenty posters is the right one.
--
-- These are TMDB paths, not a second source, which is what keeps them free of a
-- licensing question the project has not already answered: the same API terms and
-- the same attribution cover them. Both were verified present in TMDB's image set
-- for their film. 361292 is Suspiria's Japanese release art (1200x1692), 393519
-- an English sheet for Raw at 2000x3000.
--
-- Its own seed rather than an edit to film_enrichment because that seed is
-- append-only and records what TMDB returned. A curated choice is a different
-- claim from an observed value, and overwriting the observation would lose it.
select
    try_cast(tmdb_id as integer) as tmdb_id,
    nullif(poster_path, '')      as poster_path
from {{ ref('poster_overrides') }}
where tmdb_id is not null
