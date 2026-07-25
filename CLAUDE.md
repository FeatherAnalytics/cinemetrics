# Cinemetrics

Personal film analytics pipeline: Letterboxd watch history → dbt/DuckDB → Next.js dashboard.

## Git

- **Branches**: Feature branches only; no direct commits to main (except automated data updates).

## Tech Stack

- **Python**: 3.11+, managed by `uv`. Type hints on all functions. Lint with `ruff`.
- **Data**: dbt-duckdb. Seeds (committed CSVs) are the source of truth. All transformations in dbt.
- **Web**: Next.js 16 static export, React 19, D3.js, Tailwind 4, Vitest.

## Data Pipeline

- **Primary key**: `tmdb_id` (integer). `imdb_id` kept as secondary identifier.
- **Rating scale**: 0–100 (`my_rating`). `star_rating` is 0–5; the factor is exactly 20.
- **Seeds are append-only**: The auto-updater appends new rows; never modifies existing data.
  One-off repairs go in their own `scripts/` file with a `--apply` flag, never in `update.py`.
- **Never use `csv.writer`/`csv.DictWriter` directly** — use `ingest.csvio.dict_writer`.
  The csv module defaults to CRLF line endings on *every* platform, while
  `.gitattributes` checks seeds out as LF. Mixing the two makes DuckDB's sniffer fail
  the dbt build (`Error when sniffing file`). This bug recurred for months because it
  only appeared after new rows were appended to a clean checkout.
- **Three-state `liked`**: `true`/`false`/NULL, where NULL means *unknown* (the 129
  pre-Letterboxd rows), not "not liked". Always filter `liked is not null` before
  computing an affection rate — collapsing them understates it by ~7.5 points.
- **Pipeline order**: RSS parse → enrich new films → dbt build → export JSON → train embeddings → upload to R2.
- **Franchise rollups**: curated in the `franchise_mapping()` macro (`transform/macros/`), keyed by collection, tmdb_id, or director.

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
