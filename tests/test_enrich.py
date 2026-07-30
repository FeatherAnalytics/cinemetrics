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
    FILM_CSV_COLUMNS,
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


def test_film_csv_columns_is_base_plus_lang_collection():
    assert FILM_CSV_COLUMNS == BASE_COLUMNS + LANG_COLLECTION_COLUMNS


def test_film_csv_columns_includes_poster_path():
    assert "poster_path" in FILM_CSV_COLUMNS


def test_candidate_csv_columns_ends_with_poster_path():
    # candidate_enrichment.csv gained poster_path last, after the four
    # candidate-only columns, rather than mid-row where the film seed puts it.
    from ingest.enrich import CANDIDATE_CSV_COLUMNS

    assert CANDIDATE_CSV_COLUMNS[-1] == "poster_path"


@pytest.mark.parametrize(
    ("kwargs", "columns_name"),
    [
        (  # scripts/update.py
            dict(prefer_omdb=True, omdb_countries=True, include_lang_collection=True),
            "FILM_CSV_COLUMNS",
        ),
        (  # scripts/fetch_candidates.py, scripts/enrich_watchlist.py
            dict(
                prefer_omdb=True, omdb_countries=True, include_lang_collection=True,
                include_candidate_meta=True,
            ),
            "CANDIDATE_CSV_COLUMNS",
        ),
        (  # scripts/rebuild_enrichment.py
            dict(
                prefer_omdb=True, omdb_countries=True, include_lang_collection=True,
                strip_text=True,
            ),
            "FILM_CSV_COLUMNS",
        ),
    ],
)
def test_row_keys_equal_the_column_list(kwargs, columns_name):
    # Each case is the flag combination a real writer passes. The commented
    # script name is the caller, and it has to stay true: the update.py case
    # used to pass include_lang_collection=False, a shape no caller has, so the
    # test proved nothing about the code that runs.
    #
    # Equality, not a subset. The regression that started this was poster_path
    # emitted by the builder with no column to land in, which a subset catches.
    # The mirror image is a column the builder stopped emitting, and that one is
    # invisible to both a subset check and to dict_writer: strict=True raises on
    # an extra key, but a MISSING key just writes a blank cell, so a dropped
    # field reaches the seed as an empty column rather than as an error.
    from ingest import enrich

    row = build_enrichment_row(
        TMDB, OMDB,
        tmdb_id="27205", imdb_id="tt1375666",
        **kwargs,
    )
    assert set(row) == set(getattr(enrich, columns_name))


def test_strict_writer_rejects_a_key_no_column_accepts():
    # The guard that would have caught the poster_path drop.
    import io

    from ingest.csvio import dict_writer

    w = dict_writer(io.StringIO(), ["a"], strict=True)
    with pytest.raises(ValueError):
        w.writerow({"a": "1", "unexpected": "2"})


def test_candidate_row_writes_under_strict_with_the_real_call_shape():
    """fetch_candidates.py and enrich_watchlist.py both write with strict=True.

    Every key the builder emits for that call shape must have a column in
    CANDIDATE_CSV_COLUMNS, or strict=True raises on every write -- trading the
    original silent-corruption bug for a guaranteed crash on the next candidate
    found.
    """
    import io

    from ingest.csvio import dict_writer
    from ingest.enrich import CANDIDATE_CSV_COLUMNS

    row = build_enrichment_row(
        TMDB, OMDB,
        tmdb_id="27205", imdb_id="tt1375666",
        prefer_omdb=True, omdb_countries=True, include_lang_collection=True,
        include_candidate_meta=True,
    )
    w = dict_writer(io.StringIO(), CANDIDATE_CSV_COLUMNS, strict=True)
    w.writerow(row)  # must not raise


@pytest.mark.parametrize(
    ("seed", "columns_name"),
    [
        ("film_enrichment.csv", "FILM_CSV_COLUMNS"),
        ("candidate_enrichment.csv", "CANDIDATE_CSV_COLUMNS"),
    ],
)
def test_writer_columns_match_the_seed_header(seed, columns_name):
    """A writer's column list must equal the header of the file it writes.

    One shared list was pointed at both seeds, which silently shifted
    poster_path into the original_language column of candidate_enrichment.csv
    on the next append. The two files have genuinely different schemas; the
    only safe check is against the bytes on disk.
    """
    import csv
    from pathlib import Path

    from ingest import enrich

    seed_path = Path(__file__).resolve().parents[1] / "transform" / "seeds" / seed
    with open(seed_path, encoding="utf-8", newline="") as fh:
        header = next(csv.reader(fh))
    assert getattr(enrich, columns_name) == header


@pytest.mark.parametrize(
    ("seed", "marker", "owner"),
    [
        # "box_office" appears in no other context under scripts/, so a literal
        # occurrence means the enrichment column order was written out by hand.
        ("film_enrichment.csv", r'"box_office"', "ingest.enrich.FILM_CSV_COLUMNS"),
        # The slice seed has only two columns, so no single column name marks a
        # copy. The list literal itself does. A row dict spelling the same two
        # keys is not a column list and must not match, which is why this looks
        # for brackets rather than for "slice".
        (
            "poster_slices.csv",
            r'\[\s*"tmdb_id"\s*,\s*"slice"\s*\]',
            "ingest.poster_slice.SLICE_CSV_COLUMNS",
        ),
    ],
)
def test_no_script_hardcodes_a_seed_column_list(seed, marker, owner):
    """No script may spell out a shared seed's column order for itself.

    Five separate copies of the enrichment list existed at one point. Adding
    poster_path to BASE_COLUMNS left every one of them stale, and the worst copy
    was four columns behind -- enough to strip production_countries,
    original_language and collection out of a committed seed on a single re-run.
    poster_slices.csv then arrived with the same arrangement: one list in
    scripts/update.py, another in scripts/backfill_poster_slices.py.

    A seed with more than one writer gets exactly one column list, exported by
    the module named in `owner`.
    """
    import re
    from pathlib import Path

    scripts = Path(__file__).resolve().parents[1] / "scripts"
    offenders = sorted(
        py.name
        for py in scripts.glob("*.py")
        if re.search(marker, py.read_text(encoding="utf-8"))
    )
    assert offenders == [], f"hardcoded {seed} column list in {offenders}; import {owner}"
