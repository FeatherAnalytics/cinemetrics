"""Download the Letterboxd account data export (zip).

The export is synchronous: one authenticated GET to /data/export/ returns the
zip in the response body. Verified 2026-07-25 by HAR capture:

    GET /user/exportdata   -> 302 -> /user/exportdata/
    GET /user/exportdata/  -> 200  text/html (trigger page, 367 bytes)
    GET /data/export/      -> 200  application/zip
                              content-disposition: attachment; filename=...zip

Only the last request matters; the first two are the page a browser visits.

AUTH: session cookie, not credentials. Letterboxd's sign-in is gated by
Cloudflare Turnstile, so scripted login is not viable — sign in once in a
browser and copy the Cookie header into LETTERBOXD_COOKIE.

The cookie includes ``cf_clearance``, which Cloudflare binds to BOTH the
originating IP and the exact User-Agent that earned it. So:
  - LETTERBOXD_USER_AGENT must match the browser that produced the cookie.
  - Requests should originate from the same network (this is why the fetch
    belongs on a home-network host rather than a CI datacenter runner).
"""

from collections.abc import Callable
from typing import Any

import requests

EXPORT_URL = "https://letterboxd.com/data/export/"

# Mirrors what Firefox sends for this request (captured 2026-07-25). Cloudflare
# scores the whole header set, not just the cookie, so a minimal request is
# challenged even with a valid cf_clearance. Accept-Encoding deliberately omits
# br/zstd — the browser advertises them, but requests cannot decode zstd.
BROWSER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Referer": "https://letterboxd.com/settings/data/",
    "DNT": "1",
    "Sec-GPC": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Priority": "u=0, i",
}

Fetch = Callable[..., Any]


class ExportError(RuntimeError):
    """Base class for export download failures."""


class ExportAuthError(ExportError):
    """Session cookie is missing, expired, or rejected."""


class ExportChallengeError(ExportError):
    """Cloudflare challenged the request (stale cf_clearance or IP/UA mismatch)."""


def _filename_from_disposition(disposition: str, fallback: str) -> str:
    """Pull filename= out of a Content-Disposition header, else return fallback."""
    for part in disposition.split(";"):
        part = part.strip()
        if part.startswith("filename="):
            return part[len("filename=") :].strip('"')
    return fallback


def fetch_export(
    cookie: str,
    user_agent: str,
    *,
    fetch: Fetch = requests.get,
    timeout: int = 120,
) -> tuple[bytes, str]:
    """Download the export zip. Returns (zip_bytes, suggested_filename).

    Redirects are not followed: a 3xx here means the session was rejected and
    Letterboxd is bouncing us to sign-in, which is a clearer signal than
    silently receiving the sign-in page's HTML with a 200.

    Raises ExportAuthError, ExportChallengeError, or ExportError.
    """
    if not cookie:
        raise ExportAuthError("LETTERBOXD_COOKIE is empty — see .env.example")
    if not user_agent:
        raise ExportAuthError("LETTERBOXD_USER_AGENT is empty — must match the browser")

    resp = fetch(
        EXPORT_URL,
        headers={**BROWSER_HEADERS, "User-Agent": user_agent, "Cookie": cookie},
        allow_redirects=False,
        timeout=timeout,
    )

    status = resp.status_code

    if status in (301, 302, 303, 307, 308):
        location = resp.headers.get("Location", "<none>")
        raise ExportAuthError(
            f"redirected to {location} — session cookie is expired or invalid. "
            "Sign in again in the browser and refresh LETTERBOXD_COOKIE."
        )

    if status in (403, 503):
        raise ExportChallengeError(
            f"HTTP {status} — Cloudflare challenged the request. The cf_clearance "
            "cookie is stale, or this request came from a different IP or "
            "User-Agent than the one that earned it."
        )

    if status != 200:
        raise ExportError(f"HTTP {status} from {EXPORT_URL}")

    content_type = resp.headers.get("Content-Type", "")
    if "zip" not in content_type.lower():
        raise ExportError(
            f"expected a zip, got Content-Type: {content_type!r}. "
            "This usually means an HTML page was returned instead of the export."
        )

    filename = _filename_from_disposition(
        resp.headers.get("Content-Disposition", ""), "letterboxd-export.zip"
    )
    return resp.content, filename
