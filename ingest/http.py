"""Shared HTTP client for TMDB and OMDb, plus a cache-decision helper.

Consolidates the four near-duplicate GET helpers (scripts/update.py,
scripts/fetch_candidates.py, ingest/tmdb.py, ingest/omdb.py). The robust
retry/backoff behavior — including the 429 handling that only
scripts/fetch_candidates.py had — is applied for every caller.

``fetch`` is injectable so tests can run without touching the network.
"""

import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import requests

TMDB_BASE = "https://api.themoviedb.org/3"
OMDB_BASE = "https://www.omdbapi.com/"

# Type alias for an injectable requests.get-like callable.
Fetch = Callable[..., Any]


def _get_json(
    url: str,
    params: dict,
    *,
    fetch: Fetch,
    attempts: int = 4,
    timeout: int = 30,
) -> dict:
    """GET with retry/backoff. 200 -> json; 429 -> longer backoff + retry.

    Returns {} when all attempts fail. Network errors are swallowed and retried.
    """
    for attempt in range(attempts):
        try:
            resp = fetch(url, params=params, timeout=timeout)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429:
                time.sleep(2 + attempt)
                continue
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    return {}


def tmdb_get(path: str, *, api_key: str | None, fetch: Fetch = requests.get, **params) -> dict:
    """GET https://api.themoviedb.org/3/{path} with retry/backoff/429 handling."""
    params["api_key"] = api_key
    return _get_json(f"{TMDB_BASE}/{path}", params, fetch=fetch)


def omdb_get(imdb_id: str, *, api_key: str | None, fetch: Fetch = requests.get) -> dict:
    """GET the OMDb record for an imdb_id with retry/backoff handling."""
    return _get_json(OMDB_BASE, {"i": imdb_id, "apikey": api_key}, fetch=fetch)


def cached_json(
    cache_file: Path,
    produce: Callable[[], Any],
    *,
    is_valid: Callable[[Any], bool],
) -> Any:
    """Return cached JSON if present, else call ``produce`` and cache the result.

    The result is written to ``cache_file`` only when ``is_valid(result)`` is
    True. This prevents a failed/empty response from poisoning the cache
    permanently (GOAL 2b).
    """
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    result = produce()
    if is_valid(result):
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result), encoding="utf-8")
    return result
