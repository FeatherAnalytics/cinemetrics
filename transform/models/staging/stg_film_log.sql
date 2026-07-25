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
    -- Pre-Letterboxd rows (129, all 2019-01-14..2019-12-17) carry my_rating but no
    -- star_rating: the Google Sheet used a 1-10 scale that was stored as 0-100.
    -- The factor is measured, not assumed — across all 665 rows holding BOTH values
    -- my_rating/star_rating is exactly 20.0, and my_rating/20 lands precisely on the
    -- valid half-star set. Deriving here means star-binned charts cover all 794
    -- watches instead of 665.
    coalesce(
        try_cast(star_rating as double),
        try_cast(my_rating as double) / 20
    )                                   as star_rating,
    cast(is_rewatch as boolean)         as is_rewatch,
    -- Nullable by design: NULL is UNKNOWN, not "not liked". The 129 pre-Letterboxd
    -- rows have no like data at all, and counting them as false would overstate
    -- affection-rate denominators by ~19%. Always filter on `liked is not null`
    -- before computing a rate.
    try_cast(liked as boolean)          as liked
from {{ ref('film_log') }}
where tmdb_id is not null
