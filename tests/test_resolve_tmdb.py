"""Tests for the tmdb resolver.

The regression tests matter most: they encode the exact failures that a strict
title+year strategy produced on the 676-film holdout. Each one is a real film
where Letterboxd's year disagrees with TMDB's, and where a DIFFERENT film shares
the title and Letterboxd's year.
"""

import pytest

from ingest.resolve_tmdb import AMBIGUITY_RATIO, normalise, resolve


def film(tmdb_id, title, year, votes, *, original_title=None, popularity=1.0):
    return {
        "id": tmdb_id,
        "title": title,
        "original_title": original_title if original_title is not None else title,
        "release_date": f"{year}-01-01" if year else None,
        "vote_count": votes,
        "popularity": popularity,
    }


def searcher(by_year: dict | None = None, no_year: list | None = None):
    """Build a search fn: results when a year is supplied vs when it isn't."""
    by_year = by_year or {}

    def search(title, year):
        return list(by_year.get(year, [])) if year else list(no_year or [])

    return search


class TestNormalise:
    def test_folds_case_punctuation_and_unicode_dashes(self):
        assert normalise("Mission: Impossible – Fallout") == "mission impossible fallout"
        assert normalise("  WALL·E  ") == "walle"

    def test_curly_and_straight_apostrophes_agree(self):
        assert normalise("Devil's Gate") == normalise("Devil’s Gate")


class TestRegressions:
    """Cases where a strict title+year match picks the wrong film."""

    def test_the_witch_prefers_the_famous_2016_film_over_a_2015_namesake(self):
        # Letterboxd says 2015; TMDB dates the Eggers film 2016. There IS exactly
        # one genuinely-2015 "The Witch" — and it is not the one we want.
        search = searcher(
            by_year={"2015": [film(526667, "The Witch", 2015, 12)]},
            no_year=[
                film(526667, "The Witch", 2015, 12),
                film(310131, "The Witch", 2016, 6300),
            ],
        )
        got = resolve("The Witch", "2015", search=search)

        assert got.tmdb_id == 310131
        assert got.strategy == "window_ranked"

    def test_under_the_skin_same_shape(self):
        search = searcher(
            by_year={"2013": [film(698232, "Under the Skin", 2013, 5)]},
            no_year=[
                film(698232, "Under the Skin", 2013, 5),
                film(97370, "Under the Skin", 2014, 4100),
            ],
        )
        assert resolve("Under the Skin", "2013", search=search).tmdb_id == 97370

    def test_exact_year_uniqueness_does_not_win_on_its_own(self):
        """A lone exact-year hit must still lose to a far more voted neighbour."""
        search = searcher(
            by_year={"2019": [film(722402, "The Beach House", 2019, 3)]},
            no_year=[
                film(722402, "The Beach House", 2019, 3),
                film(632304, "The Beach House", 2020, 480),
            ],
        )
        got = resolve("The Beach House", "2019", search=search)
        assert got.tmdb_id == 632304


class TestStrategies:
    def test_single_exact_match_in_window(self):
        search = searcher(by_year={"1999": [film(1, "Audition", 1999, 900)]})
        got = resolve("Audition", "1999", search=search)
        assert (got.tmdb_id, got.strategy, got.ambiguous) == (1, "window_unique", False)

    def test_matches_on_original_title_for_non_english_films(self):
        jp = "パーフェクトブルー"
        found = film(7, "Perfect Blue", 1997, 2000, original_title=jp)
        assert resolve(jp, "1997", search=searcher(by_year={"1997": [found]})).tmdb_id == 7

    def test_lone_result_far_from_the_stated_year_is_flagged(self):
        """A single hit is not proof — the year still has to corroborate."""
        search = searcher(no_year=[film(9, "Kill Bill: The Whole Bloody Affair", 2011, 300)])
        got = resolve("Kill Bill: The Whole Bloody Affair", "2004", search=search)
        assert got.tmdb_id == 9
        assert got.needs_review

    def test_several_exact_titles_all_outside_the_window_are_flagged(self):
        search = searcher(
            no_year=[film(9, "Obsession", 2011, 300), film(10, "Obsession", 1976, 200)]
        )
        got = resolve("Obsession", "2004", search=search)
        assert got.strategy == "title_anyyear"
        assert got.needs_review

    def test_no_results_is_unresolved_not_a_guess(self):
        got = resolve("Nonexistent Film", "1999", search=searcher())
        assert got.tmdb_id is None
        assert got.needs_review

    def test_inexact_title_with_one_result_is_accepted(self):
        """Letterboxd renames films; a lone corroborating-year hit is trustworthy."""
        renamed = film(11, "Glass Onion: A Knives Out Mystery", 2022, 5000)
        got = resolve("Glass Onion", "2022", search=searcher(by_year={"2022": [renamed]}))
        assert (got.tmdb_id, got.strategy) == (11, "single_result")
        assert not got.needs_review

    def test_inexact_title_with_several_results_refuses_to_guess(self):
        search = searcher(
            by_year={"2022": [film(11, "Glass Onion: A Knives Out", 2022, 5000),
                              film(12, "Glass Onion Documentary", 2022, 4)]}
        )
        assert resolve("Glass Onion", "2022", search=search).tmdb_id is None


class TestAmbiguity:
    def test_close_runner_up_is_flagged(self):
        search = searcher(
            by_year={"1977": [film(20, "Suspiria", 1977, 1000), film(21, "Suspiria", 1977, 900)]}
        )
        got = resolve("Suspiria", "1977", search=search)
        assert got.tmdb_id == 20
        assert got.ambiguous
        assert got.runners_up[0]["tmdb_id"] == 21

    def test_clear_winner_is_not_flagged(self):
        search = searcher(
            by_year={"1977": [film(20, "Suspiria", 1977, 4000), film(21, "Suspiria", 1977, 8)]}
        )
        got = resolve("Suspiria", "1977", search=search)
        assert got.tmdb_id == 20
        assert not got.ambiguous

    def test_zero_votes_everywhere_is_flagged(self):
        """With no vote signal there is nothing to rank on, so never trust it."""
        search = searcher(
            by_year={"1980": [film(30, "Obscure", 1980, 0), film(31, "Obscure", 1980, 0)]}
        )
        assert resolve("Obscure", "1980", search=search).ambiguous

    @pytest.mark.parametrize(
        "runner_votes,expect_flag",
        [(1000, True), (500, True), (499, False), (10, False)],
    )
    def test_flag_threshold(self, runner_votes, expect_flag):
        assert AMBIGUITY_RATIO == 0.5
        search = searcher(
            by_year={"2000": [film(40, "X", 2000, 1000), film(41, "X", 2000, runner_votes)]}
        )
        assert resolve("X", "2000", search=search).ambiguous is expect_flag


def test_searches_both_with_and_without_the_year():
    """The unfiltered search is what rescues year-divergent films."""
    calls = []

    def search(title, year):
        calls.append(year)
        return []

    resolve("Some Film", "2020", search=search)
    assert calls == ["2020", None]
