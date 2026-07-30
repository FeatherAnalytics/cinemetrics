-- The same guard as poster_path_is_populated.sql, for the column the landing
-- page barcode is drawn from.
--
-- poster_slice had descriptions in two schema files and no test at all. It comes
-- from its own seed, written by a nightly repair step, and joined into dim_film
-- on tmdb_id -- so a broken join, an empty seed or a failed image CDN blanks
-- every stripe on the landing page without a single check failing.
--
-- Thresholds match the poster_path test: NULL is legitimate for a film with no
-- poster to sample, so the invariant is a share, with an absolute floor under
-- it. All 676 films have a slice today.
select
    count(*)            as films,
    count(poster_slice) as films_with_a_slice
from {{ ref('dim_film') }}
having count(poster_slice) < 0.95 * count(*)
    or count(poster_slice) < 600
