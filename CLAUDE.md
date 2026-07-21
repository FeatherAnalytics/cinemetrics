# Cinemetrics

Personal film analytics pipeline: Letterboxd watch history → dbt/DuckDB → Next.js dashboard.

## Git

- **Commits**: Conventional format (`feat:`, `fix:`, `data:`, `docs:`, `refactor:`, `test:`). 
- **Branches**: Feature branches only; no direct commits to main (except automated data updates).

## Tech Stack

- **Python**: 3.11+, managed by `uv`. Type hints on all functions. Lint with `ruff`.
- **Data**: dbt-duckdb. Seeds (committed CSVs) are the source of truth. All transformations in dbt.
- **Web**: Next.js 16 static export, React 19, D3.js, Tailwind 4, Vitest.

## Data Pipeline

- **Primary key**: `tmdb_id` (integer). `imdb_id` kept as secondary identifier.
- **Rating scale**: 0–100 (Letterboxd stars × 20).
- **Seeds are append-only**: The auto-updater appends new rows; never modifies existing data.
- **Pipeline order**: RSS parse → enrich new films → dbt build → export JSON.

## Commands

```
make setup    # Install all dependencies
make dev      # Start Next.js dev server
make build    # Full pipeline: dbt → export → web build
make test     # All tests: ruff + eslint + dbt + vitest
make update   # Auto-update from Letterboxd RSS
```

## Deployment

- **Host**: GitHub Pages at `featheranalytics.dev/cinemetrics`
- **Static export**: `output: "export"` with `basePath: "/cinemetrics"`
- **Auto-updates**: Daily GitHub Action fetches Letterboxd RSS, enriches new films, rebuilds, and deploys.
