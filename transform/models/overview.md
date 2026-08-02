{# GENERATED FILE - do not edit.
   Rendered from overview.md.tmpl by scripts/update_doc_stats.py.
   Edit the template, then run `make doc-stats`. #}
{% docs __overview__ %}

# Cinemetrics — data model

This is the dbt layer behind [featheranalytics.dev/cinemetrics](https://featheranalytics.dev/cinemetrics),
a personal film analytics dashboard built from eight years of Letterboxd watch
history: 798 viewings of 676 films.

## How to read this

Use the **Project** tab to browse models as they sit on disk, or the **Database** tab to see
them as DuckDB relations. Click the icon at the bottom-right of any model page for its lineage
graph.

## The layers

Each layer is its own schema, so the **Database** tab groups them the way the pipeline runs.

- **Seeds** — committed CSVs, and the source of truth for the whole project. Split by where the
  data came from: schema `letterboxd` holds `film_log` (watch events) and `watchlist`, while
  schema `enrichment` holds `film_enrichment` (attributes for watched films) and
  `candidate_enrichment` (the recommendation pool). The DuckDB database is rebuilt from these on
  every run and is never persisted.
- **Staging** (schema `staging`, `stg_*`, views) — typing, cleaning, and derived columns. One
  staging model per seed, no joins.
- **Marts** (schema `marts`, tables) — `dim_film` (one row per film), `fct_watches` (one row per
  watch event), `dim_candidate` (one row per unwatched candidate, mutually exclusive with
  `dim_film`).

`tmdb_id` is the primary key throughout. `imdb_id` is kept for external linking, and its
not-null test is a warning rather than an error because coverage is incomplete by design.

## Things that might surprise you

- **`liked` and `is_rewatch` are three-state.** The 129 pre-Letterboxd rows
  (imported from a spreadsheet) never recorded either field. `liked` is NULL for those;
  `is_rewatch` is stored as `false`, which is *not* the same as "was a first viewing". Filter on
  `liked is not null` to isolate rows that actually recorded these fields — otherwise the
  affection rate is understated by 7.5 points and the rewatch rate by
  5.1.
- **Ratings use two scales.** `rating_100` is 0–100 and is the authoritative one.
  `star_rating` is 0–5, derived as `rating_100 / 20` where the source did not supply it. The
  factor of exactly 20 is measured across the 669 rows that arrived carrying
  both values, not assumed.
- **"Rewatches" and "returns" are different counts.** 209 rows are flagged
  as rewatches, but 87 of those are films whose first viewing predates the
  dataset, so they appear only once. Counting actual return visits gives 122 returns
  across 84 films.
- **Franchises are curated, not inferred.** The `franchise_mapping()` macro rolls TMDB
  collections up into umbrella franchises (the MCU, for instance) by collection, by
  `tmdb_id`, or by director.

Full architecture notes, including the ingestion and deployment pipeline, are in
[`docs/ARCHITECTURE.md`](https://github.com/FeatherAnalytics/cinemetrics/blob/main/docs/ARCHITECTURE.md).

{% enddocs %}
