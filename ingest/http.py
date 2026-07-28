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

# Whether the OS trust store has already been injected, or was found unavailable.
# Either way the answer does not change within a process, so it is decided once.
_TRUST_SETTLED = False


def _ensure_os_trust() -> bool:
    """Route TLS verification through the OS trust store. True if that just changed.

    A TLS-intercepting proxy presents certificates signed by a private CA that
    the operating system trusts and ``certifi`` — which ``requests`` bundles and
    uses instead of the OS store — does not. Every TMDB and OMDb call then fails
    verification on a machine where a browser loads the same URL fine.

    Injected LAZILY, on the first failure, rather than at import: CI and the
    GitHub Action verify correctly against the bundled roots, and reaching for the
    OS store there would swap a known-good trust anchor for a machine-dependent
    one to fix a problem those runners do not have.

    Idempotent. Returns False on every call after the first, so a caller can use
    it to decide whether an immediate retry is worth attempting.
    """
    global _TRUST_SETTLED
    if _TRUST_SETTLED:
        return False
    _TRUST_SETTLED = True
    try:
        import truststore
    except ModuleNotFoundError:
        return False
    truststore.inject_into_ssl()
    return True


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

    Two failures RAISE instead of returning {}: a rejected credential and a TLS
    verification failure. Neither is transient, and an empty dict is
    indistinguishable from a film TMDB has no record of, so the enrichment would
    write nulls over every row and the pipeline would report success. Wrong data
    reaching a mart undetected is the failure mode this project guards hardest
    against, and a stale API key would produce exactly that across all 676 films.
    """
    ssl_failures = 0
    last_ssl: requests.exceptions.SSLError | None = None
    for attempt in range(attempts):
        try:
            resp = fetch(url, params=params, timeout=timeout)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (401, 403):
                raise RuntimeError(
                    f"{url} rejected the credential ({resp.status_code}). Retrying "
                    "cannot fix this: check TMDB_API_KEY / OMDB_API_KEY in .env. "
                    "Note that python-dotenv resolves .env relative to the calling "
                    "script, so running from outside the repo finds no key at all."
                )
            if resp.status_code == 429:
                time.sleep(2 + attempt)
                continue
        except requests.exceptions.SSLError as exc:
            # Must be caught before RequestException, which is its parent.
            ssl_failures += 1
            last_ssl = exc
            if _ensure_os_trust():
                continue  # retry at once, now verifying against the OS store
        except requests.RequestException:
            pass
        time.sleep(1 + attempt)
    if ssl_failures == attempts and last_ssl is not None:
        raise RuntimeError(
            f"TLS verification failed for {url} on every attempt. If this machine "
            "runs a TLS-intercepting proxy, install truststore (`uv sync`) so "
            "verification uses the OS trust store."
        ) from last_ssl
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
