-- One row per watch event, typed, from the consolidated ratings log seed.
-- (The log combines pre-Letterboxd history with Letterboxd; the RSS updater
-- appends new rows going forward. Personal rating is on a 0-100 scale.)
select
    cast(watched_date as date)          as watched_date,
    try_cast(tmdb_id as integer)        as tmdb_id,
    imdb_id,
    title,
    try_cast(release_year as integer)   as release_year,
    try_cast(my_rating as double)       as rating_100,
    try_cast(star_rating as double)     as star_rating,
    cast(is_rewatch as boolean)         as is_rewatch
from {{ ref('film_log') }}
where tmdb_id is not null
