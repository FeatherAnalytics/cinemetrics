.PHONY: setup dev build test lint export ingest update clean

setup:
	uv sync
	cd transform && uv run dbt deps --profiles-dir .
	cd web && npm ci

dev:
	cd web && npm run dev

build:
	cd transform && uv run dbt build --profiles-dir .
	uv run python scripts/export_web.py
	uv run python scripts/train_embeddings.py
	cd web && npm run build

test:
	uv run ruff check .
	cd web && npm run lint
	cd transform && uv run dbt build --profiles-dir .
	cd web && npm test

lint:
	uv run ruff check .
	cd web && npm run lint

export:
	uv run python scripts/export_web.py

ingest:
	uv run python -m ingest.tmdb
	uv run python -m ingest.omdb
	uv run python scripts/fetch_candidates.py

update:
	uv run python scripts/update.py

candidates:
	uv run python scripts/fetch_candidates.py

train:
	uv run python scripts/train_embeddings.py

retrain:
	uv run python scripts/train_embeddings.py --force

upload:
	uv run python scripts/upload_r2.py

clean:
	rm -rf transform/target web/out web/.next __pycache__
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
