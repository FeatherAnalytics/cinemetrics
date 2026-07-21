"""Ingestion: load raw sources into DuckDB."""

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "movies.duckdb"


def connect() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH))
