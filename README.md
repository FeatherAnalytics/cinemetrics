# cinemetrics

An analytics pipeline over several years of my personal film-watching data. It takes my
Letterboxd ratings, enriches them via the TMDB and OMDb APIs, models them with dbt in DuckDB,
and answers questions about how and what I watch — in an interactive dashboard.

**Live:** https://www.featheranalytics.dev/cinemetrics/

Stack: Python, DuckDB, dbt, TMDB + OMDb APIs, Next.js. Deployed to GitHub Pages and refreshed
daily from my Letterboxd feed.

## What the dashboard shows

- **When I watch** — every watch on year-by-year swim lanes (Jan → Dec); higher dots = higher ratings.
- **Where I align and deviate** — each film as my rating vs. critics, against a diagonal of perfect
  agreement; above the line I rated higher than expected, below I rated lower.
- **Where my taste deviates** — after controlling for critic scores, the keywords I systematically
  rate higher or lower than predicted.
- **Where they come from** — a world map shaded by production count and my most-watched genre.
- **How my taste settles** — my rolling 10-watch average rating as small multiples, grouped by
  genre, language, country, runtime, release decade, or content rating.
- **Rewatches** — each film I return to, its ratings tracked over time.

Everything cross-filters, with a live stat bar and guided "story" presets. Brush (drag) any chart —
or click a country / keyword — to pull the matching films into a table (linked to Letterboxd).

## How it fits together

```
Letterboxd (ratings log)   ─┐
TMDB   (genres, keywords)  ─┼─► seeds ─► dbt (staging → marts) ─► export ─► dashboard
OMDb   (critic scores)     ─┘
```

- **seeds**: two committed files — `film_log.csv` (the ratings log) and `film_enrichment.csv`
  (per-film attributes from TMDB + OMDb, keyed by TMDB id).
- **staging**: cleaned, typed views over the seeds.
- **marts**: analysis-ready tables — `dim_film` (one row per film) and `fct_watches`
  (one row per watch).
- New watches are appended daily from the Letterboxd RSS feed.

## Layout

```
ingest/     Python: TMDB + OMDb enrichment
transform/  dbt project (seeds → staging → marts)
scripts/    export marts to the app's JSON
web/        Next.js dashboard
data/       movies.duckdb (gitignored)
```

## Data sources

See [data/README.md](data/README.md). In short: Letterboxd for the watch log, TMDB for
genres/keywords/runtime/budget/revenue/language/collection, and OMDb for critic scores, box
office, and cast. Films are keyed by TMDB id, with IMDb id kept as a secondary identifier.

## Setup

```
uv sync              # install Python + dependencies
cp .env.example .env # then add your TMDB + OMDb keys
cd transform && uv run dbt build --profiles-dir .   # build the marts from the seeds
```

## Deployment

- Static export hosted on **GitHub Pages** at https://www.featheranalytics.dev/cinemetrics/.
- A daily GitHub Action pulls new Letterboxd watches, enriches them, rebuilds, and redeploys.

## Roadmap

- [x] Data model: consolidated ratings log + TMDB/OMDb enrichment, dbt marts, tests
- [x] Dashboard: swim lanes, critic-agreement scatter, keyword residuals, world map,
      rolling-average small multiples, and rewatches — all cross-filtered, with brush-to-select
- [x] Automated daily updates from the Letterboxd RSS feed
- [x] Deploy to GitHub Pages
