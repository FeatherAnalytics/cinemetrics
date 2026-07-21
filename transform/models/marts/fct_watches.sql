-- One row per watch event, from the consolidated ratings log.
-- tmdb_id is the foreign key to dim_film; imdb_id kept for external linking.
select
    row_number() over (order by watched_date, title) as watch_id,
    tmdb_id,
    imdb_id,
    watched_date,
    rating_100,
    star_rating,
    is_rewatch,
    title       as film_title,
    release_year as film_year
from {{ ref('stg_film_log') }}
