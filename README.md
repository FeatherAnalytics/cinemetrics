# cinemetrics

An end-to-end analytics pipeline over seven years of personal film-watching data. It takes my
Letterboxd ratings, enriches them via the TMDB and OMDb APIs, models them with dbt in DuckDB,
and surfaces the results in an interactive dashboard — including an ML-powered recommendation
engine that suggests what to watch next.

**Live:** [featheranalytics.dev/cinemetrics](https://featheranalytics.dev/cinemetrics)

Stack: Python, DuckDB, dbt, scikit-learn, TMDB + OMDb APIs, Next.js, Cloudflare R2.

## What it does

- Cross-filtered dashboard: every chart responds to every filter in real time.
- Viewing habits over time — pace, seasonality, genre drift.
- Taste alignment with critics (Metascore, Rotten Tomatoes, IMDb).
- Rewatch patterns and rating changes.
- Recommendation engine: "Recommend a film" (weighted random from films similar to my
  favourites), with EN/Non-EN toggle, dashboard filter integration, and explainable results
  ("Why this film").

## How it fits together

```
Letterboxd (ratings log)   ─┐
TMDB   (genres, keywords)  ─┼─► seeds ─► dbt (staging → marts) ─► export ─► dashboard
OMDb   (critic scores)     ─┘
                                  │
                            candidate pool ─► scikit-learn (feature embeddings)
                                  │
                            Cloudflare R2 ─► browser (cosine similarity, client-side)
```

- **Seeds**: committed CSVs — `film_log.csv` (watch history), `film_enrichment.csv` (rated films),
  `candidate_enrichment.csv` (recommendation pool from TMDB similar + popular).
- **Staging**: cleaned, typed views over the seeds.
- **Marts**: `dim_film`, `fct_watches`, `dim_candidate`.
- **ML pipeline**: TF-IDF + multi-hot feature encoding → cosine similarity. Pre-computed at
  build time, served from R2, similarity math runs client-side. (A k-NN taste predictor was
  evaluated but did not beat critic scores, so it stays an offline tool — `scripts/eval_taste.py`.)
- **Auto-updates**: daily GitHub Action fetches Letterboxd RSS, enriches new films, retrains
  if data changed, uploads to R2, deploys.

## Layout

```
recommend/  Python: ML pipeline (feature encoding, model, explainability)
ingest/     Python: TMDB + OMDb enrichment
transform/  dbt project (seeds → staging → marts)
scripts/    export, candidate fetch, training, R2 upload
tests/      pytest: encoding, model, ingest, taste eval
web/        Next.js dashboard + recommendation drawer
data/       movies.duckdb, ml/ (gitignored)
```

## Setup

```bash
make setup                # install Python (uv) + Node dependencies
cp .env.example .env      # add your TMDB, OMDb, and R2 keys
make build                # full pipeline: dbt → export → train → web build
make dev                  # start Next.js dev server at localhost:3000
```

### Commands

| Command | What it does |
|---------|-------------|
| `make build` | Full pipeline: dbt build → export JSON → train embeddings → web build |
| `make dev` | Start Next.js dev server |
| `make test` | Run all tests: ruff + eslint + dbt + vitest |
| `make candidates` | Fetch candidate films from TMDB (similar + popular) |
| `make train` | Train embeddings (skips if data unchanged) |
| `make retrain` | Force retrain regardless of data changes |
| `make upload` | Upload embeddings to Cloudflare R2 |
| `make update` | Auto-update from Letterboxd RSS |

## Data sources

Letterboxd for the watch log, TMDB for genres/keywords/runtime/budget/revenue/similar films,
OMDb for critic scores, box office, and cast. Primary key: `tmdb_id`.
