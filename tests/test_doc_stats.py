"""Tests for the figures the docs quote.

The point is not that the arithmetic works — DuckDB can be trusted to count. The
point is that each figure keeps counting the thing the prose claims it counts.
More than one reading is defensible for most of them, and the docs assert one:

  "206 rows are flagged as rewatches, but 87 of those are films whose first
   viewing predates the dataset, so they appear only once."

"Appear only once" means the film has exactly one row. Counting flagged rows that
are merely the earliest row held for their film gives 98, because a film can have
a flagged first row and later returns too. Both are reasonable numbers; only one
matches the sentence. Redefining the query would silently republish a different
claim under the same words, so the relationships are pinned here instead.

These run against the built DuckDB and skip when it is absent, so a checkout that
has not run `make build` still gets a green suite.
"""

import pytest

from scripts.update_doc_stats import (
    DB,
    MANIFEST,
    MARKER,
    MARKER_TARGETS,
    PLACEHOLDER,
    TEMPLATE_NOTE,
    TEMPLATE_TARGETS,
    collect_stats,
)

# Both artifacts come from the same `dbt build`. The manifest is checked too
# because collect_stats now requires it, so testing only for the database would
# turn a missing manifest into a SystemExit instead of a skip.
pytestmark = pytest.mark.skipif(
    not (DB.exists() and MANIFEST.exists()),
    reason="needs a dbt build (data/movies.duckdb + transform/target/manifest.json)",
)


@pytest.fixture(scope="module")
def stats() -> dict[str, str]:
    return collect_stats()


def as_int(stats: dict[str, str], key: str) -> int:
    return int(stats[key].replace(",", ""))


def test_every_marker_and_placeholder_resolves(stats: dict[str, str]) -> None:
    """A name the script does not produce would freeze that figure forever, since
    substitution skips what it cannot resolve."""
    unknown = []
    for path in MARKER_TARGETS:
        for match in MARKER.finditer(path.read_text(encoding="utf-8")):
            if match.group("name") not in stats:
                unknown.append(f"{path.name}:{match.group('name')}")
    for template, _ in TEMPLATE_TARGETS:
        # Strip the template's own header note first, exactly as the renderer
        # does: that note documents the placeholder syntax, so scanning the raw
        # file would flag its example as an unknown stat.
        body = TEMPLATE_NOTE.sub("", template.read_text(encoding="utf-8"))
        for match in PLACEHOLDER.finditer(body):
            if match.group("name") not in stats:
                unknown.append(f"{template.name}:{match.group('name')}")
    assert not unknown, f"names with no matching stat: {unknown}"


def test_generated_overview_carries_no_markers() -> None:
    """The whole reason overview.md is templated: dbt's renderer escapes HTML
    comments and prints them on the published page, so the output must be clean."""
    for _, output in TEMPLATE_TARGETS:
        if not output.exists():
            continue
        text = output.read_text(encoding="utf-8")
        assert "<!--" not in text, f"{output.name} contains an HTML comment"
        assert "%%stat:" not in text, f"{output.name} has an unfilled placeholder"
        assert text.startswith("{# GENERATED FILE"), (
            f"{output.name} lost its generated-file banner; a hand edit here gets "
            "overwritten on the next run"
        )


def test_sheet_era_rows_are_the_unknown_liked_rows(stats: dict[str, str]) -> None:
    """The pre-Letterboxd import is identified by `liked is null`, which is what
    makes `liked is not null` the filter for "rows that recorded these fields"."""
    assert as_int(stats, "sheet_era") == 129


def test_returns_exceed_the_films_they_belong_to(stats: dict[str, str]) -> None:
    """A return is a viewing, not a film: several films are returned to twice, so
    returns must outnumber the films with returns."""
    assert as_int(stats, "returns") > as_int(stats, "films_with_returns")


def test_flagged_once_is_films_seen_exactly_once_not_earliest_rows(
    stats: dict[str, str],
) -> None:
    """The distinction the docs turn on. 87 is "the film has one row"; the
    earliest-row-held reading gives 98. If this ever equals the larger number,
    the query drifted and the sentence around it became false."""
    flagged_once = as_int(stats, "flagged_once")

    assert flagged_once == 87
    assert flagged_once < as_int(stats, "flagged_rewatches")
    assert flagged_once < as_int(stats, "flagged_earliest_row"), (
        "flagged_once has caught up with the earliest-row-held reading; the docs "
        "cite them as two different numbers"
    )


def test_rate_deltas_are_positive(stats: dict[str, str]) -> None:
    """Collapsing unknowns into "false" can only drag a rate down, so filtering
    first must raise it. A negative delta means the sign flipped somewhere and the
    "understates by" wording is backwards."""
    assert float(stats["affection_delta"]) > 0
    assert float(stats["rewatch_delta"]) > 0


def test_seed_both_ratings_is_measured_on_the_seed_not_the_mart(
    stats: dict[str, str],
) -> None:
    """Staging derives star_rating from my_rating, so every mart row carries both
    and the mart cannot support the factor-of-20 claim. Fewer rows than total
    proves the count came from the seed."""
    assert as_int(stats, "seed_rows_both") < as_int(stats, "watches")


def test_films_never_outnumber_watches(stats: dict[str, str]) -> None:
    """Guards against the mixup the old share card shipped, which labelled the
    viewing count as a film count."""
    assert as_int(stats, "films") < as_int(stats, "watches")
