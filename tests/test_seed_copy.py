"""The seed COPY must survive a title containing a literal double quote.

dbt-duckdb loads seeds with `COPY ... (FORMAT CSV, HEADER TRUE, DELIMITER ',')`
and never sets ESCAPE, so DuckDB auto-detects it. Dialect detection only reads
the first chunk (~2048 rows), and no seed in this repo has ever held a doubled
quote, so it settles on `escape = (empty)`. The first correctly-escaped `""`
past that chunk then fails the whole build:

    Invalid Input Error: CSV Error on Line: 11392
    Value with unterminated quote found.

transform/macros/seed.sql overrides the macro to pin QUOTE and ESCAPE. These
tests pin the two halves of that fix: the options are still in the macro, and
they still load a row the bare dialect cannot.
"""

import csv
import re
from pathlib import Path

import duckdb
import pytest

from ingest.csvio import dict_writer

SEED_MACRO = Path(__file__).resolve().parents[1] / "transform/macros/seed.sql"

# The quoted row has to land past DuckDB's dialect-detection chunk to reproduce;
# inside it the sniffer sees the `""` and gets the escape right on its own.
SNIFFER_CHUNK_ROWS = 2048
FILLER_ROWS = 3000

QUOTED_TITLE = 'Usada Pekora 1st PekoLive - "USAGI the MEGAMI!!"'
COLUMNS = ["tmdb_id", "genres", "title", "poster_path"]

# The filler needs a field the writer wraps in quotes (genres hold commas, as they
# do in the real seed) but no escaped quote. Quoting with nothing escaped is what
# leaves the sniffer free to pick `escape = (empty)`; filler with no quotes at all
# does not reproduce the failure.
FILLER_GENRES = "Animation, Music"


def copy_options() -> str:
    """The option list transform/macros/seed.sql passes to COPY, ready to run.

    Reading it out of the macro rather than restating it means deleting the
    override fails these tests instead of silently reopening the bug.
    """
    macro = SEED_MACRO.read_text(encoding="utf-8")
    match = re.search(r"\(FORMAT CSV[^)]*\)", macro)
    if match is None:
        pytest.fail(f"no COPY option list found in {SEED_MACRO}")
    return match.group(0).replace("{{ delimiter }}", ",")


@pytest.fixture
def seed_csv(tmp_path: Path) -> Path:
    path = tmp_path / "seed.csv"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, COLUMNS)
        writer.writeheader()
        writer.writerows(
            {
                "tmdb_id": i,
                "genres": FILLER_GENRES,
                "title": f"Film {i}",
                "poster_path": f"/{i}.jpg",
            }
            for i in range(FILLER_ROWS)
        )
        writer.writerow(
            {
                "tmdb_id": 1190623,
                "genres": FILLER_GENRES,
                "title": QUOTED_TITLE,
                "poster_path": "/wbg3.jpg",
            }
        )
    return path


@pytest.fixture
def con() -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    connection.execute(
        "create table seed "
        "(tmdb_id bigint, genres varchar, title varchar, poster_path varchar)"
    )
    return connection


def test_quoted_title_survives_the_seed_copy(seed_csv, con):
    con.execute(f"COPY seed FROM '{seed_csv}' {copy_options()}")

    loaded = con.execute("select title from seed where tmdb_id = 1190623").fetchone()
    assert loaded[0] == QUOTED_TITLE
    assert con.execute("select count(*) from seed").fetchone()[0] == FILLER_ROWS + 1


def test_the_row_is_past_the_chunk_the_sniffer_reads(seed_csv):
    """Guards the fixture itself: shrink FILLER_ROWS and the bug stops reproducing."""
    with open(seed_csv, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))

    quoted_at = next(i for i, row in enumerate(rows) if row[0] == "1190623")
    assert quoted_at > SNIFFER_CHUNK_ROWS


def test_the_bare_dialect_still_needs_the_override(seed_csv, con):
    """Without pinned options the load fails — this is why the override exists.

    A DuckDB release that makes this pass means the override is removable.
    """
    with pytest.raises(duckdb.InvalidInputException, match="unterminated quote"):
        con.execute(f"COPY seed FROM '{seed_csv}' (FORMAT CSV, HEADER TRUE, DELIMITER ',')")
