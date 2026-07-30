"""GOAL 2b: fetch_candidates must not cache empty/failed TMDB responses.

An empty response previously got written to the cache file, poisoning it
permanently. These tests inject a fake ``_tmdb_get`` (no network) and assert the
cache file is written only on a genuine non-empty success.
"""

import importlib.util
import json
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fc = _load("fetch_candidates_mod", "fetch_candidates.py")
# The other writer that appends to candidate_enrichment.csv.
ew = _load("enrich_watchlist_mod", "enrich_watchlist.py")


@pytest.fixture
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(fc, "CACHE", tmp_path)
    return tmp_path


def test_similar_empty_not_cached(cache_dir, monkeypatch):
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: {})
    out = fc._fetch_similar(111)
    assert out == []
    assert not (cache_dir / "similar_111.json").exists()


def test_similar_nonempty_is_cached(cache_dir, monkeypatch):
    monkeypatch.setattr(
        fc, "_tmdb_get", lambda *a, **k: {"results": [{"id": 1}, {"id": 2}]}
    )
    out = fc._fetch_similar(222)
    assert out == [1, 2]
    cache = cache_dir / "similar_222.json"
    assert cache.exists()
    assert json.loads(cache.read_text(encoding="utf-8")) == [1, 2]


def test_detail_empty_not_cached(cache_dir, monkeypatch):
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: {})
    out = fc._enrich_tmdb(333)
    assert out is None
    assert not (cache_dir / "detail_333.json").exists()


DETAIL = {
    "id": 444,
    "imdb_id": "",
    "title": "Fake Film",
    "original_title": "Faux Film",
    "release_date": "1994-09-23",
    "vote_average": 7.34,
    "vote_count": 1234,
    "genres": [{"name": "Drama"}],
    "keywords": {"keywords": []},
    "runtime": 100,
    "budget": 0,
    "revenue": 0,
    "production_countries": [{"iso_3166_1": "US"}],
    "original_language": "en",
    "belongs_to_collection": None,
}


def test_detail_nonempty_is_cached(cache_dir, monkeypatch):
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: DETAIL)
    out = fc._enrich_tmdb(444)
    assert out is not None
    assert out["tmdb_id"] == "444"
    assert out["genres"] == "Drama"
    assert (cache_dir / "detail_444.json").exists()


def test_new_candidate_row_fills_every_candidate_only_column(cache_dir, monkeypatch):
    """A candidate the nightly job writes must not land nameless.

    title, release_date, tmdb_rating and tmdb_votes were in
    candidate_enrichment.csv only because one-off backfills put them there, and
    for months no writer populated any of the four. Every new candidate
    therefore arrived with an empty title, and its card still rendered because
    the Letterboxd link resolves through imdb_id -- which is how nameless
    recommendations reached production. TMDB serves all four in the detail
    payload this script already fetches.
    """
    from ingest.enrich import CANDIDATE_META_COLUMNS

    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: DETAIL)
    row = fc._enrich_tmdb(444)

    blank = [c for c in CANDIDATE_META_COLUMNS if not row.get(c)]
    assert blank == [], f"candidate row left these unpopulated: {blank}"
    assert row["title"] == "Fake Film"
    assert row["release_date"] == "1994-09-23"
    assert row["tmdb_rating"] == "7.3"
    assert row["tmdb_votes"] == "1234"


def test_both_candidate_writers_produce_the_same_row(cache_dir, monkeypatch):
    """enrich_watchlist.py appends to the same seed as fetch_candidates.py.

    Two writers, one file: if their flags drift apart, one of them starts
    writing rows of a different shape into a committed seed.
    """
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: DETAIL)
    monkeypatch.setattr(ew, "tmdb_get", lambda *a, **k: DETAIL)
    monkeypatch.setattr(ew, "CACHE", cache_dir / "watchlist")

    assert ew._enrich(444) == fc._enrich_tmdb(444)
