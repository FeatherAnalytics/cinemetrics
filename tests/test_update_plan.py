"""Order-of-operations planner for scripts/update.py (GOAL 2c).

A watch is only logged when its film enrichment is present — either it was
already enriched, or it was enriched successfully in this run. Watches whose
enrichment failed are held back so a watch is never logged without enrichment.

Also covers the other order the nightly depends on: the poster slice seed stays
in numeric tmdb_id order, so the row a run adds is the only row its commit
touches. That one is asserted against the bytes on disk, because the whole point
of the ordering is what the file looks like to git.
"""

import difflib
import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "update_mod", Path(__file__).resolve().parents[1] / "scripts" / "update.py"
)
update_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(update_mod)
loggable_watches = update_mod.loggable_watches

FILM = {"tmdb_id": "60", "poster_path": "/x.jpg"}


@pytest.fixture(autouse=True)
def _seed_out_of_reach(monkeypatch, tmp_path):
    """No test in this module may address the committed seed.

    Not hypothetical: a test that stubs the wrong writer falls through to the
    real one, and these tests exercise a function whose whole job is writing
    poster_slices.csv. Three rows for tmdb_id 60 reached the committed seed that
    way. Redirecting the module's path constant means the worst case is a
    scribbled tmp file.
    """
    monkeypatch.setattr(update_mod, "SLICES_PATH", tmp_path / "poster_slices.csv")


def _no_network(monkeypatch, encoded: str = "ab" * 60) -> None:
    monkeypatch.setattr(update_mod, "slice_for_poster", lambda _p: encoded)


def test_slice_fetch_failure_does_not_abort_the_run(monkeypatch, capsys):
    def boom(_path: str) -> str:
        raise RuntimeError("CDN down")

    monkeypatch.setattr(update_mod, "slice_for_poster", boom)
    monkeypatch.setattr(update_mod, "write_slice_seed", lambda *a, **k: None)

    update_mod.insert_into_slices([FILM])  # must not raise
    assert "WARNING" in capsys.readouterr().out


def test_slice_write_failure_does_not_abort_the_run(monkeypatch, capsys):
    """A failed slice write must not cost the watch.

    insert_into_slices runs before append_to_log, so anything it raises stops
    the watch from ever reaching film_log.csv. The slice is repairable on the
    next run; the watch is not, once it scrolls off the RSS feed.
    """
    _no_network(monkeypatch)

    def boom(*_a, **_k):
        raise OSError("disk full")

    monkeypatch.setattr(update_mod, "write_slice_seed", boom)

    update_mod.insert_into_slices([FILM])  # must not raise
    assert "WARNING" in capsys.readouterr().out


def test_slices_are_written_when_the_write_succeeds(monkeypatch):
    _no_network(monkeypatch)
    calls = []
    monkeypatch.setattr(update_mod, "read_slice_seed", lambda _p: {})
    monkeypatch.setattr(update_mod, "write_slice_seed", lambda *a: calls.append(a))

    update_mod.insert_into_slices([FILM])

    (path, slices) = calls[0]
    assert path == update_mod.SLICES_PATH
    assert slices == {"60": "ab" * 60}


def test_the_new_slice_is_merged_into_what_the_seed_already_holds(monkeypatch):
    """The write is a read-modify-write, so it must not drop the existing rows."""
    _no_network(monkeypatch)
    calls = []
    monkeypatch.setattr(update_mod, "read_slice_seed", lambda _p: {"9": "cd" * 60})
    monkeypatch.setattr(update_mod, "write_slice_seed", lambda *a: calls.append(a))

    update_mod.insert_into_slices([FILM])

    assert calls[0][1] == {"9": "cd" * 60, "60": "ab" * 60}


def test_a_new_slice_lands_in_numeric_order_not_at_the_end(monkeypatch, tmp_path):
    """Bytes on disk, because the reason for the ordering is the git diff.

    Also pins LF endings: the seed is checked out LF and a CRLF row would fail
    DuckDB's sniffer on the next build.
    """
    seed = tmp_path / "poster_slices.csv"
    seed.write_text("tmdb_id,slice\n100,aaa\n900,ccc\n", encoding="utf-8")
    monkeypatch.setattr(update_mod, "SLICES_PATH", seed)
    _no_network(monkeypatch, encoded="bbb")

    update_mod.insert_into_slices([{"tmdb_id": "300", "poster_path": "/x.jpg"}])

    assert seed.read_bytes() == b"tmdb_id,slice\n100,aaa\n300,bbb\n900,ccc\n"


def test_adding_one_film_leaves_a_sorted_seed_and_rewrites_no_row(monkeypatch, tmp_path):
    """One line added, every other line untouched, and the order still holds.

    The last assertion is the one that matters, and it is not implied by the
    other two: appending the row to the END of the file also adds one line and
    rewrites none. What it leaves behind is an unsorted seed, and the cost lands
    on a LATER night, when the first repair run that has something to fetch
    re-sorts the file and puts the move in that night's commit.

    The id inserted is lower than every id already in the seed, which is the
    realistic case: tmdb_ids are not monotonic with watch date.
    """
    seed = tmp_path / "poster_slices.csv"
    seed.write_text(
        "tmdb_id,slice\n" + "".join(f"{i},{'ab' * 60}\n" for i in range(1000, 1100)),
        encoding="utf-8",
    )
    before = seed.read_text(encoding="utf-8").splitlines()
    monkeypatch.setattr(update_mod, "SLICES_PATH", seed)
    _no_network(monkeypatch, encoded="cd" * 60)

    update_mod.insert_into_slices([{"tmdb_id": "42", "poster_path": "/x.jpg"}])

    after = seed.read_text(encoding="utf-8").splitlines()
    diff = list(difflib.ndiff(before, after))
    assert [d for d in diff if d.startswith("+ ")] == [f"+ 42,{'cd' * 60}"]
    assert [d for d in diff if d.startswith("- ")] == []
    ids = [int(line.split(",")[0]) for line in after[1:]]
    assert ids == sorted(ids)


def test_logs_watch_with_existing_enrichment():
    watches = [{"tmdb_id": "10", "watched_date": "2026-01-01"}]
    out = loggable_watches(watches, existing_enrich_ids={"10"}, enriched_ids=set())
    assert out == watches


def test_logs_watch_newly_enriched():
    watches = [{"tmdb_id": "20", "watched_date": "2026-01-02"}]
    out = loggable_watches(watches, existing_enrich_ids=set(), enriched_ids={"20"})
    assert out == watches


def test_drops_watch_when_enrichment_failed():
    watches = [
        {"tmdb_id": "30", "watched_date": "2026-01-03"},
        {"tmdb_id": "31", "watched_date": "2026-01-03"},
    ]
    # 30 enriched OK; 31 failed (not in existing, not newly enriched).
    out = loggable_watches(watches, existing_enrich_ids=set(), enriched_ids={"30"})
    assert out == [watches[0]]


def test_keeps_all_when_all_covered():
    watches = [
        {"tmdb_id": "40", "watched_date": "2026-01-04"},
        {"tmdb_id": "41", "watched_date": "2026-01-04"},
    ]
    out = loggable_watches(watches, existing_enrich_ids={"40"}, enriched_ids={"41"})
    assert out == watches


def test_preserves_input_order():
    watches = [
        {"tmdb_id": "50", "watched_date": "d"},
        {"tmdb_id": "51", "watched_date": "d"},
        {"tmdb_id": "52", "watched_date": "d"},
    ]
    out = loggable_watches(watches, existing_enrich_ids={"52", "50"}, enriched_ids={"51"})
    assert out == watches


# --- OMDb running out mid-run ------------------------------------------------


def _tmdb_stub(monkeypatch) -> None:
    def fake(path: str, **_kw):
        if path.endswith("/external_ids"):
            return {"imdb_id": "tt0000060"}
        return {"id": 60, "title": "Some Film"}

    monkeypatch.setattr(update_mod, "tmdb_get", fake)
    monkeypatch.setattr(update_mod, "OMDB_KEY", "k")
    monkeypatch.setattr(update_mod, "TMDB_KEY", "k")


def test_a_spent_omdb_allowance_does_not_abort_the_run(monkeypatch, capsys):
    """A 401 from OMDb used to take the whole nightly down at its first step.

    ingest/http.py raises for 401/403, the call was unguarded, and nothing
    between here and main() caught it — so one un-enrichable film stopped
    candidates, the export, the embeddings and the deploy.
    """
    _tmdb_stub(monkeypatch)

    def rejected(*_a, **_k):
        raise RuntimeError("rejected the credential (401)")

    monkeypatch.setattr(update_mod, "omdb_get", rejected)

    assert update_mod.enrich_film("60") is None  # must not raise
    assert "holding tmdb_id=60 back" in capsys.readouterr().out


def test_the_held_back_watch_is_not_logged(monkeypatch):
    """Held back, not written half-enriched: film_enrichment has no retry pass."""
    watches = [{"tmdb_id": "60", "watched_date": "2026-01-04"}]
    assert loggable_watches(watches, existing_enrich_ids=set(), enriched_ids=set()) == []


def test_omdb_saying_it_has_no_record_still_enriches(monkeypatch):
    """Response=False is an answer, not an outage — the film keeps its TMDB row."""
    _tmdb_stub(monkeypatch)
    monkeypatch.setattr(
        update_mod, "omdb_get", lambda *a, **k: {"Response": "False", "Error": "not found"}
    )

    row = update_mod.enrich_film("60")
    assert row is not None
    assert row["imdb_id"] == "tt0000060"
    assert row["imdb_rating"] == ""
