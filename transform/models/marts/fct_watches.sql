-- One row per watch event, from the consolidated ratings log.
-- tmdb_id is the foreign key to dim_film; imdb_id kept for external linking.
with ordered as (
    select
        *,
        -- Position of this watch within its own film's history.
        --
        -- Partitioned on tmdb_id and never on title: the library holds two films
        -- called Suspiria, and grouping them would make the 2018 one's first
        -- viewing look like a return to the 1977 one.
        --
        -- The tiebreakers only matter for two watches of one film on one date.
        -- Either ordering yields the same number of returns; they are here so a
        -- rebuild cannot silently reshuffle which row is called the first.
        row_number() over (
            partition by tmdb_id
            order by watched_date, rating_100, is_rewatch
        ) as nth_watch
    from {{ ref('stg_film_log') }}
)

select
    -- Tiebreakers keep watch_id deterministic across rebuilds when several
    -- watches share a date.
    row_number() over (order by watched_date, title, tmdb_id, is_rewatch) as watch_id,
    tmdb_id,
    imdb_id,
    watched_date,
    rating_100,
    star_rating,
    -- The flag exactly as the source recorded it. Untouched on purpose: the
    -- published "flagged rewatches" figures are about this column, and
    -- docs/ARCHITECTURE.md draws a deliberate distinction between it and the
    -- number of returns actually visible in the data.
    is_rewatch,
    /*
      Whether an earlier watch of this same film exists in the dataset.

      Purely ordinal, which is what makes it answerable for the sheet era. The
      Google Sheet had no rewatch field, so all 129 of those rows carry
      is_rewatch = false whether or not the viewing was a return — Midsommar's
      2019-10-06 entry is the second time that film appears and still reads as a
      first viewing. Position in a film's own history does not depend on the
      source having recorded anything.
    */
    nth_watch > 1                                   as is_return,
    /*
      What "was this a rewatch?" should actually answer, and the column the
      dashboard filters on.

      The union of the two, because neither is sufficient alone. The recorded
      flag misses every sheet-era return. The ordinal misses a film whose only
      row is flagged as a rewatch, where the original viewing predates the
      dataset entirely — 87 films sit in exactly that position, and the flag is
      the only evidence for them.

      Still not the whole truth: a sheet-era row that IS its film's first
      appearance stays false, because whether it was a return to some viewing
      from before the data begins is not knowable from the data.
    */
    coalesce(is_rewatch, false) or nth_watch > 1    as is_rewatch_effective,
    liked,
    title       as film_title,
    release_year as film_year
from ordered
