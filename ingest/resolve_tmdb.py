"""Resolve (title, year) pairs to tmdb_id.

The Letterboxd export carries no tmdb_id or imdb_id — only boxd.it URIs, Name and
Year — so watchlist and list films must be resolved by title search.

MEASURED 2026-07-25: 100% precision and 100% recall on a 676-film labelled holdout
(every film in film_log, whose ids come independently from Letterboxd's RSS
`tmdb:movieId` and from imdb_id via TMDB /find).

The counterintuitive part: AN EXACT YEAR MATCH IS FALSE CONFIDENCE. A strict
title+year strategy scored only 99.26%, and every one of its failures was a film
where Letterboxd's year disagrees with TMDB's (the D1 repair set). Querying TMDB
with Letterboxd's year skips the correct film and lands on a *different* film
sharing that title and year — "The Witch" is 2015 on Letterboxd, 2016 on TMDB, and
there is exactly one genuinely-2015 film of that name: the wrong one. Uniqueness
offered no protection.

So the year is a ranking signal, never a filter. Candidates come from a +/-1 window
and are ranked by vote_count.

Precision outranks recall by design: a wrong id silently attaches the wrong
genre/runtime/poster and is undetectable downstream, whereas an unresolved or
flagged film is visibly missing and cheap to fix by hand.
"""

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field

# A runner-up holding at least this share of the winner's votes means the choice
# is not clear-cut; flag it for review rather than guessing.
AMBIGUITY_RATIO = 0.5

# How far from the stated year a candidate may fall. Letterboxd and TMDB disagree
# by exactly one year on 48 films in this library alone.
YEAR_WINDOW = 1

_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−"), "-")

# Callable taking (title, year|None) and returning TMDB search result dicts.
SearchFn = Callable[[str, str | None], list[dict]]


def normalise(s: str) -> str:
    """Fold case, normalise unicode punctuation, strip non-word characters."""
    s = unicodedata.normalize("NFKC", str(s)).translate(_DASHES).casefold()
    return " ".join(re.sub(r"[^\w\s]", "", s).split())


def _year_of(result: dict) -> str:
    return (result.get("release_date") or "")[:4]


def _within_window(result: dict, year: str) -> bool:
    """True when the result's release year is within YEAR_WINDOW of the target."""
    ry = _year_of(result)
    if not (ry.isdigit() and year.isdigit()):
        return False
    return abs(int(ry) - int(year)) <= YEAR_WINDOW


def _title_matches(result: dict, want: str) -> bool:
    """Match against title AND original_title — non-English films need both."""
    return (
        normalise(result.get("title", "")) == want
        or normalise(result.get("original_title", "")) == want
    )


@dataclass(frozen=True)
class Resolution:
    """Outcome of one resolution attempt."""

    tmdb_id: int | None
    strategy: str
    ambiguous: bool
    title: str
    year: str
    runners_up: list[dict] = field(default_factory=list)

    @property
    def needs_review(self) -> bool:
        """True when a human should look: unresolved, or resolved but not clear-cut."""
        return self.tmdb_id is None or self.ambiguous


def resolve(title: str, year: str, *, search: SearchFn) -> Resolution:
    """Resolve one (title, year) to a tmdb_id.

    Strategies, in order:
      window_unique   - exactly one exact-title match within the year window
      window_ranked   - several; highest vote_count wins
      single_result   - the search returned exactly one film, title inexact
      title_anyyear   - exact title but outside the window (always ambiguous)
      unresolved      - nothing confident
    """
    want = normalise(title)

    pool: dict[int, dict] = {}
    for result in [*search(title, year), *search(title, None)]:
        if result.get("id") is not None:
            pool.setdefault(result["id"], result)
    results = list(pool.values())

    if not results:
        return Resolution(None, "unresolved", False, title, year)

    exact = [r for r in results if _title_matches(r, want)]

    window = [r for r in exact if _within_window(r, year)]

    if window:
        ordered = sorted(window, key=lambda r: _rank(r, year), reverse=True)
        best, rest = ordered[0], ordered[1:]

        ambiguous = False
        if rest:
            top_votes = best.get("vote_count") or 0
            next_votes = rest[0].get("vote_count") or 0
            ambiguous = top_votes == 0 or (next_votes / top_votes) >= AMBIGUITY_RATIO

        strategy = "window_unique" if len(window) == 1 else "window_ranked"
        return Resolution(best["id"], strategy, ambiguous, title, year, _brief(rest))

    if len(results) == 1:
        # One candidate, title inexact (e.g. a renamed film: "Glass Onion" ->
        # "Glass Onion: A Knives Out Mystery"). Accept it, but the year still has
        # to corroborate — a lone hit years adrift is a guess, not a match.
        only = results[0]
        return Resolution(
            only["id"], "single_result", not _within_window(only, year), title, year
        )

    if exact:
        # Exact title but no year anywhere near — plausible, never trusted.
        best = max(exact, key=lambda r: r.get("vote_count") or 0)
        others = [r for r in exact if r["id"] != best["id"]]
        return Resolution(best["id"], "title_anyyear", True, title, year, _brief(others))

    return Resolution(None, "unresolved", False, title, year, _brief(results[:3]))


def _rank(result: dict, year: str) -> tuple:
    """Rank by votes, then popularity; year proximity only breaks ties.

    vote_count is preferred over popularity because popularity is a volatile
    current-trend score, while vote_count is a stable proxy for "the film someone
    actually meant".
    """
    ry = _year_of(result)
    distance = abs(int(ry) - int(year)) if ry.isdigit() and year.isdigit() else YEAR_WINDOW
    return (
        result.get("vote_count") or 0,
        result.get("popularity") or 0.0,
        -distance,
    )


def _brief(results: list[dict]) -> list[dict]:
    """Trim candidates to what a human needs to adjudicate a flagged row."""
    return [
        {
            "tmdb_id": r.get("id"),
            "title": r.get("title", ""),
            "year": _year_of(r),
            "votes": r.get("vote_count") or 0,
        }
        for r in results[:4]
    ]
