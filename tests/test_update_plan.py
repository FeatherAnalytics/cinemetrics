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
