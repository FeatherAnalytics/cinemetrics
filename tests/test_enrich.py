"""Enrichment-row builder consolidated from update.py, fetch_candidates.py,
and rebuild_enrichment.py.

Golden values captured from the original three builders on a representative
TMDB + OMDb sample. The refactor must reproduce them byte-for-byte, including
the per-caller differences (which source wins for genres/countries, and which
columns are emitted).
"""

from ingest.enrich import build_enrichment_row

TMDB = {
    "id": 27205,
    "title": "Inception",
    "genres": [{"name": "Action"}, {"name": "Science Fiction"}],
    "keywords": {"keywords": [{"name": "dream"}, {"name": "heist"}]},
    "runtime": 148,
    "budget": 160000000,
    "revenue": 825532764,
    "production_countries": [{"iso_3166_1": "US"}, {"iso_3166_1": "GB"}],
    "original_language": "en",
    "belongs_to_collection": {"name": "Inception Collection"},
    "imdb_id": "tt1375666",
}
OMDB = {
    "Response": "True",
    "Genre": "Action, Adventure, Sci-Fi",
    "Runtime": "148 min",
    "Metascore": "74",
    "Ratings": [{"Source": "Rotten Tomatoes", "Value": "87%"}],
    "imdbRating": "8.8",
    "imdbVotes": "2,400,000",
    "BoxOffice": "$292,587,330",
    "Director": "Christopher Nolan",
    "Actors": "Leonardo DiCaprio, Joseph Gordon-Levitt",
    "Rated": "PG-13",
    "Country": "United States, United Kingdom",
}

UPDATE_GOLD = {
    "tmdb_id": "27205", "imdb_id": "tt1375666",
    "genres": "Action, Adventure, Sci-Fi", "keywords": "dream, heist",
    "runtime": "148", "budget": "160000000", "revenue": "825532764",
    "metascore": "74", "rt_rating": "87", "imdb_rating": "8.8",
    "imdb_votes": "2400000", "box_office": "292587330",
    "director": "Christopher Nolan",
    "actors": "Leonardo DiCaprio, Joseph Gordon-Levitt", "rated": "PG-13",
    "production_countries": "US, GB",
}
FETCH_GOLD = {
    "tmdb_id": "27205", "imdb_id": "tt1375666",
    "genres": "Action, Science Fiction", "keywords": "dream, heist",
    "runtime": "148", "budget": "160000000", "revenue": "825532764",
    "metascore": "74", "rt_rating": "87", "imdb_rating": "8.8",
    "imdb_votes": "2400000", "box_office": "292587330",
    "director": "Christopher Nolan",
    "actors": "Leonardo DiCaprio, Joseph Gordon-Levitt", "rated": "PG-13",
    "production_countries": "US, GB", "original_language": "en",
    "collection": "Inception Collection",
}
REBUILD_GOLD = {
    "tmdb_id": "27205", "imdb_id": "tt1375666",
    "genres": "Action, Adventure, Sci-Fi", "keywords": "dream, heist",
    "runtime": "148", "budget": "160000000", "revenue": "825532764",
    "metascore": "74", "rt_rating": "87", "imdb_rating": "8.8",
    "imdb_votes": "2400000", "box_office": "292587330",
    "director": "Christopher Nolan",
    "actors": "Leonardo DiCaprio, Joseph Gordon-Levitt", "rated": "PG-13",
    "production_countries": "US, GB", "original_language": "en",
    "collection": "Inception Collection",
}


def test_update_variant_matches_golden():
    row = build_enrichment_row(
        TMDB, OMDB, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=True, omdb_countries=True, include_lang_collection=False,
    )
    assert row == UPDATE_GOLD
    # update variant emits exactly 16 columns (no lang/collection)
    assert "original_language" not in row
    assert "collection" not in row


def test_fetch_variant_matches_golden():
    row = build_enrichment_row(
        TMDB, OMDB, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=False, omdb_countries=False, include_lang_collection=True,
    )
    assert row == FETCH_GOLD


def test_rebuild_variant_matches_golden():
    row = build_enrichment_row(
        TMDB, OMDB, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=True, omdb_countries=True, include_lang_collection=True,
        strip_text=True,
    )
    assert row == REBUILD_GOLD


def test_update_falls_back_to_tmdb_when_omdb_empty():
    """No OMDb: genres/runtime/countries come from TMDB, ISO joined directly."""
    row = build_enrichment_row(
        TMDB, {}, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=True, omdb_countries=True, include_lang_collection=False,
    )
    assert row["genres"] == "Action, Science Fiction"
    assert row["runtime"] == "148"
    assert row["director"] == ""
    assert row["metascore"] == ""
    assert row["production_countries"] == "US, GB"


def test_fetch_variant_omdb_empty_blanks_omdb_fields():
    row = build_enrichment_row(
        TMDB, {}, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=False, omdb_countries=False, include_lang_collection=True,
    )
    assert row["genres"] == "Action, Science Fiction"
    assert row["director"] == ""
    assert row["rated"] == ""
    assert row["metascore"] == ""
    assert row["production_countries"] == "US, GB"


def test_column_order_matches_update():
    row = build_enrichment_row(
        TMDB, OMDB, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=True, omdb_countries=True, include_lang_collection=False,
    )
    assert list(row.keys()) == list(UPDATE_GOLD.keys())


def test_column_order_matches_fetch():
    row = build_enrichment_row(
        TMDB, OMDB, tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=False, omdb_countries=False, include_lang_collection=True,
    )
    assert list(row.keys()) == list(FETCH_GOLD.keys())
