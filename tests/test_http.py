"""Shared TMDB/OMDb HTTP client + cache-decision logic.

Network is never hit: a fake ``fetch`` callable is injected. ``time.sleep`` is
monkeypatched to a no-op so retry loops run instantly.
"""

import json

import pytest

from ingest import http


class FakeResp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(http.time, "sleep", lambda *_a, **_k: None)


def test_tmdb_get_success_returns_json():
    calls = []

    def fetch(url, params=None, timeout=None):
        calls.append((url, params))
        return FakeResp(200, {"id": 1, "title": "X"})

    out = http.tmdb_get("movie/1", api_key="KEY", fetch=fetch, append_to_response="keywords")
    assert out == {"id": 1, "title": "X"}
    assert len(calls) == 1
    url, params = calls[0]
    assert url == "https://api.themoviedb.org/3/movie/1"
    assert params["api_key"] == "KEY"
    assert params["append_to_response"] == "keywords"


def test_tmdb_get_retries_then_succeeds():
    seq = [FakeResp(500, {}), FakeResp(200, {"id": 2})]

    def fetch(url, params=None, timeout=None):
        return seq.pop(0)

    out = http.tmdb_get("movie/2", api_key="KEY", fetch=fetch)
    assert out == {"id": 2}


def test_tmdb_get_handles_429_and_retries():
    seq = [FakeResp(429, {}), FakeResp(200, {"id": 3})]

    def fetch(url, params=None, timeout=None):
        return seq.pop(0)

    out = http.tmdb_get("movie/3", api_key="KEY", fetch=fetch)
    assert out == {"id": 3}


def test_tmdb_get_exhausts_and_returns_empty():
    def fetch(url, params=None, timeout=None):
        return FakeResp(500, {})

    out = http.tmdb_get("movie/4", api_key="KEY", fetch=fetch)
    assert out == {}


def test_tmdb_get_swallows_request_exception():
    import requests

    def fetch(url, params=None, timeout=None):
        raise requests.RequestException("boom")

    out = http.tmdb_get("movie/5", api_key="KEY", fetch=fetch)
    assert out == {}


def test_omdb_get_success():
    def fetch(url, params=None, timeout=None):
        assert params["i"] == "tt1375666"
        assert params["apikey"] == "OKEY"
        return FakeResp(200, {"Response": "True", "Title": "Inception"})

    out = http.omdb_get("tt1375666", api_key="OKEY", fetch=fetch)
    assert out["Title"] == "Inception"


class TestCachedJson:
    def test_reads_existing_cache_without_producing(self, tmp_path):
        cache = tmp_path / "detail_1.json"
        cache.write_text(json.dumps({"id": 1, "cached": True}), encoding="utf-8")
        produced = []

        def produce():
            produced.append(1)
            return {"id": 999}

        out = http.cached_json(cache, produce, is_valid=lambda d: bool(d))
        assert out == {"id": 1, "cached": True}
        assert produced == []  # cache short-circuits produce

    def test_writes_cache_on_valid_result(self, tmp_path):
        cache = tmp_path / "sub" / "detail_2.json"

        def produce():
            return {"id": 2}

        out = http.cached_json(cache, produce, is_valid=lambda d: bool(d.get("id")))
        assert out == {"id": 2}
        assert cache.exists()
        assert json.loads(cache.read_text(encoding="utf-8")) == {"id": 2}

    def test_does_not_cache_empty_result(self, tmp_path):
        """A failed/empty response must not poison the cache permanently."""
        cache = tmp_path / "detail_3.json"

        def produce():
            return {}

        out = http.cached_json(cache, produce, is_valid=lambda d: bool(d.get("id")))
        assert out == {}
        assert not cache.exists()

    def test_does_not_cache_invalid_by_predicate(self, tmp_path):
        cache = tmp_path / "similar_4.json"

        def produce():
            return []  # empty similar list -> do not cache

        out = http.cached_json(cache, produce, is_valid=lambda v: len(v) > 0)
        assert out == []
        assert not cache.exists()

    def test_caches_nonempty_list(self, tmp_path):
        cache = tmp_path / "similar_5.json"

        def produce():
            return [10, 20, 30]

        out = http.cached_json(cache, produce, is_valid=lambda v: len(v) > 0)
        assert out == [10, 20, 30]
        assert json.loads(cache.read_text(encoding="utf-8")) == [10, 20, 30]
