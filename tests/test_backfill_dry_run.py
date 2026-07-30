"""The repair scripts must not spend what they have nothing to repair.

Two costs, one theme. A dry run must not spend the calls it is previewing: both
poster backfills used to run the whole fetch loop and then check --apply, so a
preview cost 676 TMDB requests, or 676 poster downloads, for output that was
discarded. The network is stubbed here and the assertion is that the stub is
never reached.

And an --apply run with nothing to repair must not spend a commit: the nightly
reads poster_slices.csv's hash to decide whether a repair happened, so a run
that changed no slice has to leave the file alone. That one is asserted against
the bytes and the mtime, since writing identical bytes would pass a content
check while still doing the write.
"""

import csv
import importlib.util
import sys
from pathlib import Path

import pytest

from ingest.csvio import write_rows

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeConnection:
    """The two calls backfill_poster_slices.py makes against DuckDB."""

    def __init__(self, rows: list[tuple[int, str]]):
        self._rows = rows

    def execute(self, _sql: str) -> "_FakeConnection":
        return self

    def fetchall(self) -> list[tuple[int, str]]:
        return self._rows

    def close(self) -> None:
        pass


@pytest.fixture
def _dry_argv(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["backfill"])


def test_slices_dry_run_downloads_no_posters(monkeypatch, tmp_path, capsys, _dry_argv):
    mod = _load("backfill_poster_slices")
    fetched: list[str] = []

    monkeypatch.setattr(mod, "SEED", tmp_path / "poster_slices.csv")
    monkeypatch.setattr(mod.duckdb, "connect", lambda *a, **k: _FakeConnection([(1, "/a.jpg")]))
    monkeypatch.setattr(mod, "slice_for_poster", lambda path: fetched.append(path) or "")

    mod.main()

    assert fetched == []
    assert "1 to fetch" in capsys.readouterr().out


SEED_BYTES = b"tmdb_id,slice\n100,aaa\n900,ccc\n"


@pytest.fixture
def _apply_argv(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["backfill", "--apply"])


def _seeded(tmp_path: Path) -> Path:
    seed = tmp_path / "poster_slices.csv"
    seed.write_bytes(SEED_BYTES)
    return seed


def test_apply_with_every_slice_present_does_not_touch_the_seed(
    monkeypatch, tmp_path, _apply_argv
):
    mod = _load("backfill_poster_slices")
    seed = _seeded(tmp_path)
    stat_before = seed.stat()

    monkeypatch.setattr(mod, "SEED", seed)
    monkeypatch.setattr(
        mod.duckdb, "connect", lambda *a, **k: _FakeConnection([(100, "/a.jpg"), (900, "/c.jpg")])
    )

    mod.main()

    assert seed.read_bytes() == SEED_BYTES
    # Not merely equal: the write was skipped, so the file was never replaced.
    assert seed.stat().st_mtime_ns == stat_before.st_mtime_ns


def test_apply_whose_every_fetch_fails_does_not_touch_the_seed(
    monkeypatch, tmp_path, _apply_argv
):
    """`todo` was non-empty and the mapping still ended up unchanged."""
    mod = _load("backfill_poster_slices")
    seed = _seeded(tmp_path)
    stat_before = seed.stat()

    def boom(_path: str) -> str:
        raise RuntimeError("CDN down")

    monkeypatch.setattr(mod, "SEED", seed)
    monkeypatch.setattr(
        mod.duckdb, "connect", lambda *a, **k: _FakeConnection([(300, "/b.jpg")])
    )
    monkeypatch.setattr(mod, "slice_for_poster", boom)

    mod.main()

    assert seed.read_bytes() == SEED_BYTES
    assert seed.stat().st_mtime_ns == stat_before.st_mtime_ns


def test_apply_writes_only_the_slice_it_repaired(monkeypatch, tmp_path, _apply_argv):
    mod = _load("backfill_poster_slices")
    seed = _seeded(tmp_path)

    monkeypatch.setattr(mod, "SEED", seed)
    monkeypatch.setattr(
        mod.duckdb,
        "connect",
        lambda *a, **k: _FakeConnection([(100, "/a.jpg"), (300, "/b.jpg"), (900, "/c.jpg")]),
    )
    monkeypatch.setattr(mod, "slice_for_poster", lambda _p: "bbb")

    mod.main()

    assert seed.read_bytes() == b"tmdb_id,slice\n100,aaa\n300,bbb\n900,ccc\n"


def test_paths_dry_run_calls_no_tmdb(monkeypatch, tmp_path, capsys, _dry_argv):
    mod = _load("backfill_poster_paths")
    fetched: list[str] = []

    seed = tmp_path / "film_enrichment.csv"
    write_rows(seed, [{"tmdb_id": "1"}], mod.FILM_CSV_COLUMNS)

    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    monkeypatch.setattr(mod, "SEED", seed)
    monkeypatch.setattr(mod, "fetch_poster_path", lambda tid, key: fetched.append(tid) or "")

    mod.main()

    assert fetched == []
    assert "1 missing poster_path" in capsys.readouterr().out
    # The seed is untouched: still one row, still no poster_path.
    with open(seed, encoding="utf-8", newline="") as fh:
        assert [r["poster_path"] for r in csv.DictReader(fh)] == [""]
