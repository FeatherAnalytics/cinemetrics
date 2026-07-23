"""GOAL 2b: fetch_candidates must not cache empty/failed TMDB responses.

An empty response previously got written to the cache file, poisoning it
permanently. These tests inject a fake ``_tmdb_get`` (no network) and assert the
cache file is written only on a genuine non-empty success.
"""

import importlib.util
import json
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "fetch_candidates_mod",
    Path(__file__).resolve().parents[1] / "scripts" / "fetch_candidates.py",
)
fc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(fc)


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


def test_detail_nonempty_is_cached(cache_dir, monkeypatch):
    detail = {
        "id": 444,
        "imdb_id": "",
        "genres": [{"name": "Drama"}],
        "keywords": {"keywords": []},
        "runtime": 100,
        "budget": 0,
        "revenue": 0,
        "production_countries": [{"iso_3166_1": "US"}],
        "original_language": "en",
        "belongs_to_collection": None,
    }
    monkeypatch.setattr(fc, "_tmdb_get", lambda *a, **k: detail)
    out = fc._enrich_tmdb(444)
    assert out is not None
    assert out["tmdb_id"] == "444"
    assert out["genres"] == "Drama"
    assert (cache_dir / "detail_444.json").exists()
