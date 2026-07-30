"""Order-of-operations planner for scripts/update.py (GOAL 2c).

A watch is only logged when its film enrichment is present — either it was
already enriched, or it was enriched successfully in this run. Watches whose
enrichment failed are held back so a watch is never logged without enrichment.
"""

import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "update_mod", Path(__file__).resolve().parents[1] / "scripts" / "update.py"
)
update_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(update_mod)
loggable_watches = update_mod.loggable_watches

FILM = {"tmdb_id": "60", "poster_path": "/x.jpg"}


def _no_network(monkeypatch, encoded: str = "ab" * 60) -> None:
    monkeypatch.setattr(update_mod, "slice_for_poster", lambda _p: encoded)


def test_slice_fetch_failure_does_not_abort_the_run(monkeypatch, capsys):
    def boom(_path: str) -> str:
        raise RuntimeError("CDN down")

    monkeypatch.setattr(update_mod, "slice_for_poster", boom)
    monkeypatch.setattr(update_mod, "append_rows", lambda *a, **k: None)

    update_mod.append_to_slices([FILM])  # must not raise
    assert "WARNING" in capsys.readouterr().out


def test_slice_write_failure_does_not_abort_the_run(monkeypatch, capsys):
    """A failed slice append must not cost the watch.

    append_to_slices runs before append_to_log, so anything it raises stops the
    watch from ever reaching film_log.csv. The slice is repairable on the next
    run; the watch is not, once it scrolls off the RSS feed.
    """
    _no_network(monkeypatch)

    def boom(*_a, **_k):
        raise OSError("disk full")

    monkeypatch.setattr(update_mod, "append_rows", boom)

    update_mod.append_to_slices([FILM])  # must not raise
    assert "WARNING" in capsys.readouterr().out


def test_slices_are_appended_when_the_write_succeeds(monkeypatch):
    _no_network(monkeypatch)
    calls = []
    monkeypatch.setattr(update_mod, "append_rows", lambda *a, **k: calls.append((a, k)))

    update_mod.append_to_slices([FILM])

    (path, rows, columns), kwargs = calls[0]
    assert rows == [{"tmdb_id": "60", "slice": "ab" * 60}]
    assert columns == ["tmdb_id", "slice"]
    assert kwargs == {"strict": True}


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
