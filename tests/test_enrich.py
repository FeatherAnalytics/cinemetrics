"""Enrichment-row builder consolidated from update.py, fetch_candidates.py,
and rebuild_enrichment.py.

Golden values captured from the original three builders on a representative
TMDB + OMDb sample. The refactor must reproduce them byte-for-byte, including
the per-caller differences (which source wins for genres/countries, and which
columns are emitted).
"""

import pytest

from ingest.enrich import (
    BASE_COLUMNS,
    ENRICHMENT_CSV_COLUMNS,
    LANG_COLLECTION_COLUMNS,
    build_enrichment_row,
)

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
    "production_countries": "US, GB", "poster_path": "",
}
FETCH_GOLD = {
    "tmdb_id": "27205", "imdb_id": "tt1375666",
    "genres": "Action, Science Fiction", "keywords": "dream, heist",
    "runtime": "148", "budget": "160000000", "revenue": "825532764",
    "metascore": "74", "rt_rating": "87", "imdb_rating": "8.8",
    "imdb_votes": "2400000", "box_office": "292587330",
    "director": "Christopher Nolan",
    "actors": "Leonardo DiCaprio, Joseph Gordon-Levitt", "rated": "PG-13",
    "production_countries": "US, GB", "poster_path": "",
    "original_language": "en",
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
    "production_countries": "US, GB", "poster_path": "",
    "original_language": "en",
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


def test_build_enrichment_row_carries_poster_path():
    row = build_enrichment_row(
        {"poster_path": "/abc123.jpg"},
        {},
        tmdb_id="550",
        imdb_id="tt0137523",
        prefer_omdb=True,
        omdb_countries=True,
        include_lang_collection=True,
    )
    assert row["poster_path"] == "/abc123.jpg"


def test_build_enrichment_row_poster_path_missing_is_empty():
    row = build_enrichment_row(
        {},
        {},
        tmdb_id="550",
        imdb_id="tt0137523",
        prefer_omdb=True,
        omdb_countries=True,
        include_lang_collection=True,
    )
    assert row["poster_path"] == ""


def test_poster_path_is_last_base_column():
    # Column order is load-bearing: the seeds are diffed in git, and a column
    # inserted mid-row rewrites every line of every enrichment CSV.
    assert BASE_COLUMNS[-1] == "poster_path"


def test_enrichment_csv_columns_is_base_plus_lang_collection():
    assert ENRICHMENT_CSV_COLUMNS == BASE_COLUMNS + LANG_COLLECTION_COLUMNS


def test_enrichment_csv_columns_includes_poster_path():
    assert "poster_path" in ENRICHMENT_CSV_COLUMNS


@pytest.mark.parametrize(
    ("prefer_omdb", "omdb_countries", "include_lang_collection", "strip_text"),
    [
        (True, True, True, False),  # scripts/update.py
        (True, True, True, False),  # scripts/fetch_candidates.py
        (True, True, True, True),   # scripts/rebuild_enrichment.py
    ],
)
def test_every_row_key_has_a_column(
    prefer_omdb, omdb_countries, include_lang_collection, strip_text
):
    # The regression this guards: a key added to build_enrichment_row without a
    # matching entry in ENRICHMENT_CSV_COLUMNS. That is how poster_path was
    # silently dropped, and dict_writer's strict=True now turns it into a raise
    # at write time -- this catches it at test time instead.
    row = build_enrichment_row(
        TMDB, OMDB,
        tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=prefer_omdb,
        omdb_countries=omdb_countries,
        include_lang_collection=include_lang_collection,
        strip_text=strip_text,
    )
    assert set(row) <= set(ENRICHMENT_CSV_COLUMNS)


def test_strict_writer_rejects_a_key_no_column_accepts():
    # The guard that would have caught the poster_path drop.
    import io

    from ingest.csvio import dict_writer

    w = dict_writer(io.StringIO(), ["a"], strict=True)
    with pytest.raises(ValueError):
        w.writerow({"a": "1", "unexpected": "2"})
