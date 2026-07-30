-- One row per film that has poster art: 20 RGB stops sampled down the poster,
-- top to bottom, packed as 120 hex characters with no separators.
--
-- Its own seed rather than another film_enrichment column because it is derived
-- from the image CDN rather than the TMDB JSON, and is regenerable from
-- poster_path alone — so re-deriving it never has to touch the enrichment seed's
-- history.
select
    try_cast(tmdb_id as integer) as tmdb_id,
    nullif(slice, '')            as poster_slice
from {{ ref('poster_slices') }}
where tmdb_id is not null
