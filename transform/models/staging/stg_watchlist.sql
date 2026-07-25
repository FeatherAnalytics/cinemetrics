-- One row per film currently on the Letterboxd watchlist, keyed by tmdb_id.
-- Sourced from the account export (which carries no ids) and resolved via
-- scripts/resolve_export.py. TV entries are excluded upstream.
--
-- SNAPSHOT, NOT HISTORY: the export lists what is on the watchlist *now* plus the
-- date each film was added. Removals are not recorded anywhere, so anything that
-- depends on films leaving the list cannot be derived from this.
select
    try_cast(tmdb_id as integer)      as tmdb_id,
    title,
    try_cast(release_year as integer) as release_year,
    cast(added_date as date)          as added_date
from {{ ref('watchlist') }}
where tmdb_id is not null
