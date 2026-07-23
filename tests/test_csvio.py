"""Atomic seed-append helper used by scripts/update.py.

Verifies: header on a new/empty file, no duplicate header on append, atomic
replace (target always valid), and extra keys ignored (matches DictWriter
extrasaction="ignore").
"""

import csv

from ingest.csvio import append_rows

COLS = ["tmdb_id", "imdb_id", "title"]


def _read(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.reader(f))


def test_writes_header_on_new_file(tmp_path):
    path = tmp_path / "film_log.csv"
    append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A"}], COLS)
    rows = _read(path)
    assert rows[0] == COLS
    assert rows[1] == ["1", "tt1", "A"]
    assert len(rows) == 2


def test_writes_header_on_empty_existing_file(tmp_path):
    path = tmp_path / "film_log.csv"
    path.write_text("", encoding="utf-8")
    append_rows(path, [{"tmdb_id": "2", "imdb_id": "tt2", "title": "B"}], COLS)
    rows = _read(path)
    assert rows[0] == COLS
    assert rows[1] == ["2", "tt2", "B"]


def test_appends_without_duplicate_header(tmp_path):
    path = tmp_path / "film_log.csv"
    append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A"}], COLS)
    append_rows(path, [{"tmdb_id": "2", "imdb_id": "tt2", "title": "B"}], COLS)
    rows = _read(path)
    assert rows[0] == COLS
    assert rows[1] == ["1", "tt1", "A"]
    assert rows[2] == ["2", "tt2", "B"]
    assert rows.count(COLS) == 1


def test_ignores_extra_keys(tmp_path):
    path = tmp_path / "film_log.csv"
    append_rows(
        path,
        [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A", "star_rating": "5"}],
        COLS,
    )
    rows = _read(path)
    assert rows[1] == ["1", "tt1", "A"]


def test_empty_rows_is_noop(tmp_path):
    path = tmp_path / "film_log.csv"
    append_rows(path, [], COLS)
    # No rows to append -> nothing written, no partial file with a lone header.
    assert not path.exists()


def test_preserves_existing_content_atomically(tmp_path):
    path = tmp_path / "film_log.csv"
    path.write_text("tmdb_id,imdb_id,title\r\n9,tt9,Old\r\n", encoding="utf-8")
    append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "New"}], COLS)
    rows = _read(path)
    assert rows[0] == COLS
    assert rows[1] == ["9", "tt9", "Old"]
    assert rows[2] == ["1", "tt1", "New"]
    # No leftover temp files in the directory.
    assert [p.name for p in tmp_path.iterdir()] == ["film_log.csv"]
