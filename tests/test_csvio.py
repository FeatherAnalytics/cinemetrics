"""Atomic seed-append helper used by scripts/update.py.

Verifies: header on a new/empty file, no duplicate header on append, atomic
replace (target always valid), extra keys ignored (matches DictWriter
extrasaction="ignore"), and LF-only line endings.
"""

import csv

import pytest

from ingest.csvio import LINE_TERMINATOR, append_rows, dict_writer, write_rows

COLS = ["tmdb_id", "imdb_id", "title"]


def _read(path):
    # newline="" is required by the csv module: without it the text layer performs
    # universal-newline translation and csv.reader sees rows the file does not have.
    with open(path, encoding="utf-8", newline="") as f:
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


class TestLineEndings:
    """Seeds must be LF-only.

    `.gitattributes` declares `* text=auto eol=lf`, so git checks the seeds out
    with LF. Python's csv module defaults to lineterminator="\\r\\n" on EVERY
    platform, so appending to a clean checkout used to yield LF history plus CRLF
    new rows — and DuckDB's sniffer rejects a mixed-ending file outright, failing
    the dbt build. This bug recurred for months because it only appeared after new
    watches were appended.
    """

    def test_terminator_is_lf(self):
        assert LINE_TERMINATOR == "\n"

    def test_append_to_new_file_writes_lf_only(self, tmp_path):
        path = tmp_path / "film_log.csv"
        append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A"}], COLS)
        raw = path.read_bytes()
        assert b"\r\n" not in raw
        assert raw.count(b"\n") == 2  # header + one row

    def test_append_to_lf_file_does_not_mix_endings(self, tmp_path):
        """The exact regression: LF history + appended rows must stay LF-only."""
        path = tmp_path / "film_log.csv"
        path.write_bytes(b"tmdb_id,imdb_id,title\n9,tt9,Old\n")
        append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "New"}], COLS)

        raw = path.read_bytes()
        assert b"\r\n" not in raw, "CRLF row appended to an LF file — DuckDB will refuse it"
        assert raw == b"tmdb_id,imdb_id,title\n9,tt9,Old\n1,tt1,New\n"

    def test_dict_writer_emits_lf(self, tmp_path):
        path = tmp_path / "out.csv"
        with path.open("w", encoding="utf-8", newline="") as fh:
            writer = dict_writer(fh, COLS)
            writer.writeheader()
            writer.writerow({"tmdb_id": "1", "imdb_id": "tt1", "title": "A"})
        assert b"\r\n" not in path.read_bytes()


def test_preserves_existing_content_atomically(tmp_path):
    path = tmp_path / "film_log.csv"
    # newline="" writes these bytes verbatim. Without it, Windows translates the \n
    # inside each \r\n into \r\n, producing \r\r\n — a phantom blank line between
    # every row, which reads back as an empty list and fails this test spuriously.
    path.write_text(
        "tmdb_id,imdb_id,title\r\n9,tt9,Old\r\n", encoding="utf-8", newline=""
    )
    append_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "New"}], COLS)
    rows = _read(path)
    assert rows[0] == COLS
    assert rows[1] == ["9", "tt9", "Old"]
    assert rows[2] == ["1", "tt1", "New"]
    # No leftover temp files in the directory.
    assert [p.name for p in tmp_path.iterdir()] == ["film_log.csv"]


class TestWriteRows:
    """``write_rows`` is the whole-file counterpart to ``append_rows``: it
    replaces a committed seed instead of adding to it, for the scripts that
    rebuild a seed from scratch rather than appending new watches.
    """

    def test_replaces_existing_content_and_writes_header(self, tmp_path):
        path = tmp_path / "film_enrichment.csv"
        path.write_text("tmdb_id,imdb_id,title\n9,tt9,Old\n", encoding="utf-8")
        write_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "New"}], COLS)
        rows = _read(path)
        assert rows == [COLS, ["1", "tt1", "New"]]

    def test_output_is_lf_terminated(self, tmp_path):
        path = tmp_path / "film_enrichment.csv"
        write_rows(path, [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A"}], COLS)
        raw = path.read_bytes()
        assert b"\r\n" not in raw
        assert raw == b"tmdb_id,imdb_id,title\n1,tt1,A\n"

    def test_strict_raises_on_a_key_with_no_column(self, tmp_path):
        path = tmp_path / "film_enrichment.csv"
        with pytest.raises(ValueError):
            write_rows(
                path,
                [{"tmdb_id": "1", "imdb_id": "tt1", "title": "A", "extra": "x"}],
                COLS,
                strict=True,
            )

    def test_a_mid_write_failure_leaves_the_original_file_intact(self, tmp_path):
        """The point of the whole change: a raise partway through the write must
        not touch the committed seed, and must not leave a stray .tmp file
        behind for the next run to trip over.
        """
        path = tmp_path / "film_enrichment.csv"
        original = "tmdb_id,imdb_id,title\n9,tt9,Old\n"
        path.write_text(original, encoding="utf-8")

        with pytest.raises(ValueError):
            write_rows(
                path,
                [
                    {"tmdb_id": "1", "imdb_id": "tt1", "title": "New"},
                    {"tmdb_id": "2", "imdb_id": "tt2", "title": "Bad", "extra": "x"},
                ],
                COLS,
                strict=True,
            )

        assert path.read_text(encoding="utf-8") == original
        assert [p.name for p in tmp_path.iterdir()] == ["film_enrichment.csv"]
