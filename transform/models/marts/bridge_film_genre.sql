-- One row per (tmdb_id, genre) for both watched films and candidates.
-- Splits the comma-separated genres string into individual rows.
select
    tmdb_id,
    trim(genre) as genre,
    is_candidate
from (
    select tmdb_id, unnest(string_split(genres, ', ')) as genre, false as is_candidate
    from {{ ref('dim_film') }}
    where genres is not null and genres <> ''
    union all
    select tmdb_id, unnest(string_split(genres, ', ')) as genre, true as is_candidate
    from {{ ref('dim_candidate') }}
    where genres is not null and genres <> ''
)
where trim(genre) <> ''
