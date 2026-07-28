"""Refresh the figures quoted in the docs from the built marts.

The docs cite counts that move whenever a film is logged. They drifted twice in
one day before this existed: "118 returns across 82 films" became 119 across 83,
and "665 rows carry both" became 666, after a single new watch.

Only digits are generated. Each figure sits inside an inline marker:

    but <!--stat:flagged_once-->87<!--/stat--> of those are films whose ...

so the surrounding argument stays hand-written. A marker naming an unknown stat
is an error rather than a silent no-op.

    uv run python scripts/update_doc_stats.py            # rewrite in place
    uv run python scripts/update_doc_stats.py --check     # exit 1 if stale

DEFINITIONS MATTER MORE THAN THE QUERIES. Every figure below states what it
counts, because more than one reading is usually defensible and the docs assert
one of them. tests/test_doc_stats.py pins the values so that redefining a query
fails the build instead of quietly republishing a different claim.
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "movies.duckdb"
SEED_LOG = ROOT / "transform" / "seeds" / "film_log.csv"
MANIFEST = ROOT / "transform" / "target" / "manifest.json"
WEB_JSON = ROOT / "web" / "public" / "data" / "cinemetrics.json"

# Edited in place: an inline HTML comment wraps each figure, so the prose around
# it stays hand-written. Safe here because GitHub renders HTML comments invisibly.
MARKER_TARGETS = [ROOT / "docs" / "ARCHITECTURE.md"]
MARKER = re.compile(r"(<!--stat:(?P<name>[a-z0-9_]+)-->)(?P<value>.*?)(<!--/stat-->)", re.S)

# Rendered from a template instead, because dbt's docs renderer escapes HTML
# comments and prints them as literal text on the published page. The generated
# file must contain no markers at all.
TEMPLATE_TARGETS = [
    (
        ROOT / "transform" / "models" / "overview.md.tmpl",
        ROOT / "transform" / "models" / "overview.md",
    )
]
PLACEHOLDER = re.compile(r"%%stat:(?P<name>[a-z0-9_]+)%%")

# A whole generated block rather than a single figure: the lineage diagram is
# rebuilt from the dbt manifest, so it cannot drift from the DAG dbt actually ran.
LINEAGE_BLOCK = re.compile(
    r"(<!--lineage:begin-->)(?P<body>.*?)(<!--lineage:end-->)", re.S
)

# Order the schemas the way the data flows, so the diagram reads left to right.
SCHEMA_ORDER = ["letterboxd", "enrichment", "staging", "marts"]

# Jinja comment wrapper on the template's own header note, stripped from the
# output so the generated file does not carry build instructions into dbt.
TEMPLATE_NOTE = re.compile(r"\A\{#.*?#\}\s*", re.S)

# Replaces that note in the output. A Jinja comment, and it sits outside the
# {% docs %} block, so dbt never renders it - but anyone opening the file sees
# that editing it is pointless. Hand edits here have already been lost once.
BANNER = (
    "{# GENERATED FILE - do not edit.\n"
    "   Rendered from overview.md.tmpl by scripts/update_doc_stats.py.\n"
    "   Edit the template, then run `make doc-stats`. #}\n"
)

SPAN_WORDS = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve",
]


def collect_stats() -> dict[str, str]:
    """Every figure the docs quote, with the definition it is quoted under."""
    if not DB.exists():
        raise SystemExit(f"{DB.relative_to(ROOT)} missing — run `make build` first.")

    con = duckdb.connect(str(DB), read_only=True)

    def scalar(sql: str) -> float:
        return con.execute(sql).fetchone()[0]

    # Grain: one row per viewing, one row per film, one row per unwatched candidate.
    watches = int(scalar("select count(*) from marts.fct_watches"))
    films = int(scalar("select count(*) from marts.dim_film"))
    candidates = int(scalar("select count(*) from marts.dim_candidate"))

    # Calendar span of the log, matching what the dashboard header says. Watch
    # years, not release years.
    span = int(
        scalar("""
        select max(year(watched_date)) - min(year(watched_date)) + 1
        from marts.fct_watches
        """)
    )

    # Sheet-era rows: `liked` is NULL only for the pre-Letterboxd import, which is
    # what marks a row as having recorded neither `liked` nor `is_rewatch`.
    sheet_era = int(scalar("select count(*) from marts.fct_watches where liked is null"))

    # A "return" is a viewing that is not the earliest one we hold for that film.
    # Deliberately not the same as a flagged rewatch: see flagged_once below.
    returns = int(
        scalar("""
        with ranked as (
          select row_number() over (partition by tmdb_id order by watched_date) as rn
          from marts.fct_watches
        )
        select count(*) from ranked where rn > 1
        """)
    )
    films_with_returns = int(
        scalar("""
        select count(*)
        from (select tmdb_id from marts.fct_watches group by 1 having count(*) > 1)
        """)
    )

    flagged = int(scalar("select count(*) from marts.fct_watches where is_rewatch"))

    # Flagged rewatches whose film appears EXACTLY ONCE in the data — i.e. the
    # first viewing predates the dataset. Note the near-miss: counting flagged
    # rows that are merely the earliest row we hold gives a different, larger
    # number, because a film can have a flagged first row AND later returns.
    flagged_once = int(
        scalar("""
        with per_film as (select tmdb_id, count(*) as n from marts.fct_watches group by 1)
        select count(*)
        from marts.fct_watches f
        join per_film p using (tmdb_id)
        where f.is_rewatch and p.n = 1
        """)
    )

    # The rejected reading of flagged_once, quoted in the docs to show that the
    # two differ. Flagged rows that are the earliest row held for their film,
    # which also catches films with a flagged first viewing AND later returns.
    flagged_earliest_row = int(
        scalar("""
        with ranked as (
          select is_rewatch,
                 row_number() over (partition by tmdb_id order by watched_date) as rn
          from marts.fct_watches
        )
        select count(*) from ranked where is_rewatch and rn = 1
        """)
    )

    # Rate deltas: what collapsing the unknowns into "false" costs you. Quoted in
    # the docs as the reason to filter `liked is not null` first.
    def delta(column: str) -> float:
        recorded = scalar(
            f"select 100.0 * avg(case when {column} then 1.0 else 0 end) "
            f"from marts.fct_watches where liked is not null"
        )
        collapsed = scalar(
            f"select 100.0 * avg(case when {column} then 1.0 else 0 end) from marts.fct_watches"
        )
        return recorded - collapsed

    affection_delta = delta("liked")
    rewatch_delta = delta("is_rewatch")
    con.close()

    # Rows where the SOURCE carried both rating columns. This cannot come from the
    # mart: staging derives star_rating from my_rating, so post-build every row has
    # both. The factor-of-20 claim rests on the rows that arrived with both.
    with SEED_LOG.open(newline="") as fh:
        seed_rows = list(csv.DictReader(fh))
    seed_rows_both = sum(1 for r in seed_rows if r.get("my_rating") and r.get("star_rating"))

    stats = {
        "watches": f"{watches:,}",
        "films": f"{films:,}",
        "candidates": f"{candidates:,}",
        "years": str(span),
        # Small spans read better as words, which is also what the dashboard
        # header does (web/src/lib/summary.ts). Past twelve, digits win.
        "years_word": SPAN_WORDS[span] if span < len(SPAN_WORDS) else str(span),
        "sheet_era": f"{sheet_era:,}",
        "returns": f"{returns:,}",
        "films_with_returns": f"{films_with_returns:,}",
        "flagged_rewatches": f"{flagged:,}",
        "flagged_once": f"{flagged_once:,}",
        "flagged_earliest_row": f"{flagged_earliest_row:,}",
        "seed_rows_both": f"{seed_rows_both:,}",
        "affection_delta": f"{affection_delta:.1f}",
        "rewatch_delta": f"{rewatch_delta:.1f}",
    }

    # Project shape, from the dbt manifest rather than by globbing: the manifest is
    # what dbt actually ran, and it counts data tests, which no file listing does.
    # Required, not optional — a missing manifest used to leave these three names
    # unresolved, which froze whatever numbers the docs already had.
    kinds = [n.get("resource_type") for n in load_manifest()["nodes"].values()]
    stats["dbt_models"] = str(kinds.count("model"))
    stats["dbt_tests"] = str(kinds.count("test"))
    stats["dbt_seeds"] = str(kinds.count("seed"))

    if WEB_JSON.exists():
        stats["web_json_kb"] = f"{WEB_JSON.stat().st_size / 1024:.0f}"

    return stats


def load_manifest() -> dict:
    if not MANIFEST.exists():
        raise SystemExit(
            f"{MANIFEST.relative_to(ROOT)} missing — run `dbt build` in transform/ first."
        )
    return json.loads(MANIFEST.read_text())


def build_lineage() -> str:
    """Render the dbt DAG as a mermaid flowchart, grouped by schema.

    Generated from the manifest rather than drawn by hand, so it tracks the DAG
    dbt actually ran. Seeds and models only: tests would triple the node count
    without showing anything about how data moves.
    """
    manifest = load_manifest()
    nodes = manifest["nodes"]
    relevant = {
        uid: n for uid, n in nodes.items() if n.get("resource_type") in ("model", "seed")
    }

    by_schema: dict[str, list[str]] = {}
    for node in relevant.values():
        by_schema.setdefault(node["schema"], []).append(node["name"])

    edges = set()
    for child_uid in relevant:
        for parent_uid in manifest["parent_map"].get(child_uid, []):
            if parent_uid in relevant:
                edges.add((relevant[parent_uid]["name"], relevant[child_uid]["name"]))

    lines = ["```mermaid", "flowchart LR"]
    # Known schemas first in flow order, then anything new, so an added schema
    # shows up rather than being silently dropped.
    ordered = [s for s in SCHEMA_ORDER if s in by_schema]
    ordered += sorted(s for s in by_schema if s not in SCHEMA_ORDER)
    for schema in ordered:
        lines.append(f"  subgraph {schema}[{schema}]")
        for name in sorted(by_schema[schema]):
            lines.append(f"    {name}")
        lines.append("  end")
    for parent, child in sorted(edges):
        lines.append(f"  {parent} --> {child}")
    lines.append("```")
    return "\n".join(lines)


def resolve(name: str, stats: dict[str, str], where: str, problems: list[str]) -> str | None:
    if name in stats:
        return stats[name]
    problems.append(f"{where}: unknown stat '{name}'")
    return None


def edit_in_place(
    path: Path, stats: dict[str, str], lineage: str, check: bool
) -> tuple[int, list[str]]:
    """Rewrite each inline marker, plus the lineage block if the file has one."""
    problems: list[str] = []
    stale = 0

    def swap(match: re.Match[str]) -> str:
        nonlocal stale
        fresh = resolve(match.group("name"), stats, path.name, problems)
        if fresh is None:
            return match.group(0)
        if match.group("value") != fresh:
            stale += 1
            if check:
                problems.append(
                    f"{path.name}: '{match.group('name')}' says "
                    f"{match.group('value')!r}, data says {fresh!r}"
                )
        return f"{match.group(1)}{fresh}{match.group(4)}"

    updated = MARKER.sub(swap, path.read_text(encoding="utf-8"))

    def swap_lineage(match: re.Match[str]) -> str:
        nonlocal stale
        fresh = f"\n{lineage}\n"
        if match.group("body") != fresh:
            stale += 1
            if check:
                problems.append(f"{path.name}: lineage diagram is out of date")
        return f"{match.group(1)}{fresh}{match.group(3)}"

    updated = LINEAGE_BLOCK.sub(swap_lineage, updated)

    if stale and not check:
        path.write_text(updated, encoding="utf-8")
    return stale, problems


def render_template(
    template: Path, output: Path, stats: dict[str, str], check: bool
) -> tuple[int, list[str]]:
    """Fill placeholders and write the result, leaving no markers behind."""
    problems: list[str] = []

    def swap(match: re.Match[str]) -> str:
        fresh = resolve(match.group("name"), stats, template.name, problems)
        return match.group(0) if fresh is None else fresh

    body = TEMPLATE_NOTE.sub("", template.read_text(encoding="utf-8"))
    rendered = BANNER + PLACEHOLDER.sub(swap, body)
    if problems:
        return 0, problems

    current = output.read_text(encoding="utf-8") if output.exists() else None
    if current == rendered:
        return 0, problems
    if check:
        problems.append(f"{output.name}: out of date with {template.name}")
        return 1, problems
    output.write_text(rendered, encoding="utf-8")
    return 1, problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report staleness, write nothing")
    args = parser.parse_args()

    stats = collect_stats()
    lineage = build_lineage()
    total_changed = 0
    all_problems: list[str] = []

    for path in MARKER_TARGETS:
        if not path.exists():
            all_problems.append(f"missing target: {path.relative_to(ROOT)}")
            continue
        changed, problems = edit_in_place(path, stats, lineage, args.check)
        total_changed += changed
        all_problems.extend(problems)
        if changed and not args.check:
            print(f"updated {path.relative_to(ROOT)}: {changed} figure(s)")

    for template, output in TEMPLATE_TARGETS:
        if not template.exists():
            all_problems.append(f"missing template: {template.relative_to(ROOT)}")
            continue
        changed, problems = render_template(template, output, stats, args.check)
        total_changed += changed
        all_problems.extend(problems)
        if changed and not args.check:
            print(f"rendered {output.relative_to(ROOT)}")

    if all_problems:
        for problem in all_problems:
            print(problem, file=sys.stderr)
        if args.check:
            print("\nfix with: make doc-stats", file=sys.stderr)
        raise SystemExit(1)

    if not total_changed:
        print("docs already current")


if __name__ == "__main__":
    main()
