{#
  One spelling for genres the two enrichment sources name differently.

  Watched films take their genres from OMDb and candidates from TMDB, and while
  the two vocabularies agree on almost everything, they split on science
  fiction: OMDb writes "Sci-Fi", TMDB "Science Fiction". Anything joining the
  halves by genre name missed that pair entirely -- the watchlist's science
  fiction row could find none of the 68 watched films under its own name.

  OMDb's spelling wins because it is the majority of the dataset and because
  prefer_omdb is now set on every enrichment path, so TMDB's form only survives
  as the fallback used when OMDb is unreachable.

  Applied in STAGING rather than in the seeds: the seeds are the raw record of
  what each API returned, and rewriting them would lose that. This is a
  transformation, so it lives in dbt.

  Word-boundary safe by construction -- the genre column is a ", "-joined list,
  so the delimiters are matched explicitly rather than trusting a bare replace.
#}
{% macro canonical_genres(column) %}
    trim(both ', ' from
        replace(
            replace(', ' || {{ column }} || ', ', ', Science Fiction, ', ', Sci-Fi, '),
            ', Science-Fiction, ', ', Sci-Fi, '
        )
    )
{% endmacro %}
