"""Tests for the Letterboxd film-page id extractor.

The TV case is the one that matters most: this pipeline is films-only, and a /tv/
id would collide with the /movie/ id space and silently attach another film's
metadata.
"""

import pytest

from ingest.letterboxd_film_page import (
    FilmPageBlocked,
    FilmPageError,
    fetch_film_ids,
    parse_film_page,
)

PAGE = """
<html><body>
  <section class="production-masthead"><h1>The Witch</h1></section>
  <p class="text-link">
    <a href="https://www.imdb.com/title/tt4263482/maindetails"
       data-track-action="IMDb" data-track-category="Film">IMDb</a>
    <a href="https://www.themoviedb.org/movie/310131/"
       data-track-action="TMDB" data-track-category="Film">TMDb</a>
  </p>
</body></html>
"""

TV_PAGE = """
<html><body>
  <a href="https://www.themoviedb.org/tv/30991/" data-track-action="TMDB">TMDb</a>
</body></html>
"""


class FakeResponse:
    def __init__(self, status_code=200, text=""):
        self.status_code = status_code
        self.text = text


def fetcher(response):
    def fetch(url, **kwargs):
        fetch.called_with = (url, kwargs)
        return response
    return fetch


class TestParsing:
    def test_extracts_both_ids_and_content_type(self):
        got = parse_film_page(PAGE)
        assert got.tmdb_id == 310131
        assert got.imdb_id == "tt4263482"
        assert got.content_type == "movie"
        assert got.is_film

    def test_attribute_order_does_not_matter(self):
        """Why this uses a parser and not a regex."""
        html = (
            '<a data-track-category="Film" data-track-action="TMDB" '
            'href="https://www.themoviedb.org/movie/999/">x</a>'
        )
        assert parse_film_page(html).tmdb_id == 999

    def test_tv_entry_is_identified_and_not_treated_as_a_film(self):
        got = parse_film_page(TV_PAGE)
        assert got.tmdb_id == 30991
        assert got.content_type == "tv"
        assert not got.is_film, "a TV id must never be used as a film id"

    def test_missing_anchors_yield_empty_result(self):
        got = parse_film_page("<html><body><p>nothing here</p></body></html>")
        assert got.tmdb_id is None
        assert got.imdb_id == ""
        assert not got.is_film

    def test_imdb_present_without_tmdb(self):
        html = '<a href="https://www.imdb.com/title/tt1234567/" data-track-action="IMDb">x</a>'
        got = parse_film_page(html)
        assert got.imdb_id == "tt1234567"
        assert got.tmdb_id is None
        assert not got.is_film

    def test_anchor_without_href_is_ignored(self):
        assert parse_film_page('<a data-track-action="TMDB">TMDb</a>').tmdb_id is None

    def test_unparseable_href_is_ignored(self):
        html = '<a href="https://www.themoviedb.org/person/500/" data-track-action="TMDB">x</a>'
        assert parse_film_page(html).tmdb_id is None


class TestFetching:
    def test_parses_a_successful_response(self):
        fetch = fetcher(FakeResponse(200, PAGE))
        assert fetch_film_ids("https://boxd.it/eCrQ", fetch=fetch, delay=0).tmdb_id == 310131

    def test_follows_redirects_and_sends_browser_headers(self):
        fetch = fetcher(FakeResponse(200, PAGE))
        fetch_film_ids("https://boxd.it/eCrQ", fetch=fetch, delay=0)
        _, kwargs = fetch.called_with
        assert kwargs["allow_redirects"] is True, "boxd.it links are short redirects"
        assert "User-Agent" in kwargs["headers"]

    @pytest.mark.parametrize("status", [403, 503])
    def test_cloudflare_challenge_raises_a_distinct_error(self, status):
        with pytest.raises(FilmPageBlocked, match="Cloudflare"):
            fetch_film_ids("https://boxd.it/x", fetch=fetcher(FakeResponse(status)), delay=0)

    def test_other_failures_raise_the_base_error(self):
        with pytest.raises(FilmPageError, match="404"):
            fetch_film_ids("https://boxd.it/x", fetch=fetcher(FakeResponse(404)), delay=0)
