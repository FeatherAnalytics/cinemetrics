"""Tests for the Letterboxd export downloader.

The failure taxonomy matters more than the happy path here: when this breaks in
a scheduled run, the error has to say whether the cookie expired (re-copy it)
or Cloudflare challenged (wrong IP/User-Agent), because the fixes differ.
"""

import pytest

from ingest.letterboxd_export import (
    BROWSER_HEADERS,
    ExportAuthError,
    ExportChallengeError,
    ExportError,
    fetch_export,
)

COOKIE = "letterboxd.user=abc; cf_clearance=xyz"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"


class FakeResponse:
    def __init__(self, status_code: int, headers: dict | None = None, content: bytes = b""):
        self.status_code = status_code
        self.headers = headers or {}
        self.content = content


def _fetch(response: FakeResponse, captured: dict | None = None):
    def fetch(url, **kwargs):
        if captured is not None:
            captured["url"] = url
            captured.update(kwargs)
        return response
    return fetch


def test_returns_payload_and_filename_from_content_disposition():
    resp = FakeResponse(
        200,
        {
            "Content-Type": "application/zip;charset=ISO-8859-1",
            "Content-Disposition": "attachment; filename=letterboxd-me-2026-07-25.zip",
        },
        b"PK\x03\x04payload",
    )
    payload, filename = fetch_export(COOKIE, UA, fetch=_fetch(resp))

    assert payload == b"PK\x03\x04payload"
    assert filename == "letterboxd-me-2026-07-25.zip"


def test_falls_back_when_no_content_disposition():
    resp = FakeResponse(200, {"Content-Type": "application/zip"}, b"PK\x03\x04")
    _, filename = fetch_export(COOKIE, UA, fetch=_fetch(resp))
    assert filename == "letterboxd-export.zip"


def test_sends_browser_headers_and_does_not_follow_redirects():
    """Cloudflare scores the full header set; a minimal request gets a 403."""
    captured: dict = {}
    resp = FakeResponse(200, {"Content-Type": "application/zip"}, b"PK\x03\x04")
    fetch_export(COOKIE, UA, fetch=_fetch(resp, captured))

    headers = captured["headers"]
    for key, value in BROWSER_HEADERS.items():
        assert headers[key] == value
    assert headers["User-Agent"] == UA
    assert headers["Cookie"] == COOKIE
    assert captured["allow_redirects"] is False


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_redirect_means_expired_session(status):
    resp = FakeResponse(status, {"Location": "/signin/"})
    with pytest.raises(ExportAuthError, match="expired or invalid"):
        fetch_export(COOKIE, UA, fetch=_fetch(resp))


@pytest.mark.parametrize("status", [403, 503])
def test_cloudflare_challenge_is_distinct_from_auth_failure(status):
    resp = FakeResponse(status)
    with pytest.raises(ExportChallengeError, match="Cloudflare"):
        fetch_export(COOKIE, UA, fetch=_fetch(resp))


def test_html_response_is_rejected_even_with_200():
    """A signed-out request can return 200 with the sign-in page instead of a zip."""
    resp = FakeResponse(200, {"Content-Type": "text/html;charset=utf-8"}, b"<html>")
    with pytest.raises(ExportError, match="expected a zip"):
        fetch_export(COOKIE, UA, fetch=_fetch(resp))


def test_missing_credentials_fail_before_any_request():
    def explode(*args, **kwargs):  # pragma: no cover - must never be called
        raise AssertionError("should not hit the network")

    with pytest.raises(ExportAuthError, match="LETTERBOXD_COOKIE"):
        fetch_export("", UA, fetch=explode)
    with pytest.raises(ExportAuthError, match="LETTERBOXD_USER_AGENT"):
        fetch_export(COOKIE, "", fetch=explode)
