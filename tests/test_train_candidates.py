"""Candidates in the mart use canonical genres, so the encoder sees one vocabulary."""

from pathlib import Path

import duckdb

DB = Path(__file__).resolve().parents[1] / "data" / "movies.duckdb"


def test_dim_candidate_has_no_science_fiction_spelling():
    if not DB.exists():
        return
    con = duckdb.connect(str(DB), read_only=True)
    count = con.execute(
        "select count(*) from marts.dim_candidate where genres like '%Science Fiction%'"
    ).fetchone()[0]
    con.close()
    assert count == 0, f"{count} candidates still spell 'Science Fiction' instead of 'Sci-Fi'"
