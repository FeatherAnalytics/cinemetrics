"""Read a Letterboxd film page for its outbound TMDB and IMDb ids.

The deterministic fallback for films title search cannot resolve. Every Letterboxd
film page carries analytics-tagged anchors to TMDB and IMDb:

    <a href="https://www.themoviedb.org/movie/310131/" data-track-action="TMDB">
    <a href="https://www.imdb.com/title/tt4263482/"    data-track-action="IMDb">

One request per film, exact, no fuzzy matching — so it settles the handful of cases
where title+year is ambiguous or simply wrong. Confirmed as the approach used by
samlearner/letterboxd_recommendations in production (GPL-3.0; reimplemented here
from the idea, not copied).

CONTENT TYPE MATTERS. Letterboxd catalogues TV alongside film, and the anchor
distinguishes them via /movie/{id} vs /tv/{id}. This pipeline is films-only, so
`content_type` must be checked before a tmdb_id is used — a /tv/ id would collide
with the /movie/ id space and silently attach the wrong film's metadata.

⚠️ This scrapes a public page rather than using an API. Keep the volume low and the
delay polite; it is a residue-fixer for a few dozen films, not a bulk loader.
"""

import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import requests
from bs4 import BeautifulSoup

# Mirrors what a browser sends. Letterboxd sits behind Cloudflare, which scores the
# whole header set — a bare request is challenged even for a public page.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

TMDB_PATH = re.compile(r"/(movie|tv)/(\d+)")
IMDB_PATH = re.compile(r"/title/(tt\d+)")

Fetch = Callable[..., Any]


class FilmPageError(RuntimeError):
    """The film page could not be retrieved."""


class FilmPageBlocked(FilmPageError):
    """Cloudflare challenged the request.

    samlearner's project needs curl_cffi (TLS fingerprint impersonation) for
    anonymous scraping, so headers alone may not always suffice here — unlike the
    authenticated export endpoint, where they do.
    """


@dataclass(frozen=True)
class FilmPageIds:
    tmdb_id: int | None = None
    imdb_id: str = ""
    content_type: str | None = None  # "movie" | "tv" | None

    @property
    def is_film(self) -> bool:
        """True only for an actual film — the guard against TV entries."""
        return self.content_type == "movie" and self.tmdb_id is not None


def parse_film_page(html: str) -> FilmPageIds:
    """Extract TMDB/IMDb ids from Letterboxd film page HTML."""
    soup = BeautifulSoup(html, "lxml")

    tmdb_id: int | None = None
    content_type: str | None = None
    anchor = soup.find("a", attrs={"data-track-action": "TMDB"})
    if anchor and anchor.get("href"):
        match = TMDB_PATH.search(anchor["href"])
        if match:
            content_type, tmdb_id = match.group(1), int(match.group(2))

    imdb_id = ""
    anchor = soup.find("a", attrs={"data-track-action": "IMDb"})
    if anchor and anchor.get("href"):
        match = IMDB_PATH.search(anchor["href"])
        if match:
            imdb_id = match.group(1)

    return FilmPageIds(tmdb_id=tmdb_id, imdb_id=imdb_id, content_type=content_type)


def fetch_film_ids(
    url: str,
    *,
    fetch: Fetch = requests.get,
    timeout: int = 30,
    delay: float = 1.0,
) -> FilmPageIds:
    """Fetch a Letterboxd film page (boxd.it short links are followed) and parse it.

    `delay` sleeps BEFORE the request so sequential callers stay polite by default.
    """
    if delay:
        time.sleep(delay)

    response = fetch(url, headers=BROWSER_HEADERS, timeout=timeout, allow_redirects=True)

    if response.status_code in (403, 503):
        raise FilmPageBlocked(
            f"HTTP {response.status_code} for {url} — Cloudflare challenged the request. "
            "Anonymous page scraping may need TLS impersonation (curl_cffi)."
        )
    if response.status_code != 200:
        raise FilmPageError(f"HTTP {response.status_code} for {url}")

    return parse_film_page(response.text)
