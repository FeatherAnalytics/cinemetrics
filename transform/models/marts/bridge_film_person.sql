-- One row per (tmdb_id, person, role) from watched films only.
-- Candidates' actor lists are OMDb's top four and would dominate.
select tmdb_id, trim(person) as person, role
from (
    select tmdb_id, unnest(string_split(director, ', ')) as person, 'director' as role
    from {{ ref('dim_film') }}
    where director is not null and director <> ''
    union all
    select tmdb_id, unnest(string_split(actors, ', ')) as person, 'actor' as role
    from {{ ref('dim_film') }}
    where actors is not null and actors <> ''
)
where trim(person) <> ''
