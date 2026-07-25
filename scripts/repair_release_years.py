"""One-off repair: correct release_year in film_log.csv from the Letterboxd export.

film_log merges a pre-Letterboxd Google Sheet (2019-01 onward) with Letterboxd
data (2019-12-21 onward). Where both recorded the same watch, the sheet's
release_year is sometimes later than Letterboxd's — 48 of 54 by exactly one
year, which is consistent with the sheet holding a streaming/regional release
year rather than the original. Letterboxd is authoritative.

SCOPE: release_year only.

Ratings are deliberately NOT touched. Letterboxd stores ratings at film level in
ratings.csv; the per-entry Rating in diary.csv is frequently blank even when the
film is rated (e.g. Belzebuth: diary blank, ratings.csv 4). Syncing ratings from
the diary would destroy real data.

This modifies existing seed rows, which the append-only rule in CLAUDE.md
otherwise forbids — hence a separate, explicitly-invoked script with a dry-run
default, rather than anything wired into scripts/update.py.

Usage:
    uv run python scripts/repair_release_years.py <export.zip>          # preview
    uv run python scripts/repair_release_years.py <export.zip> --apply  # write
"""

import argparse
import csv
import io
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402

LOG_PATH = ROOT / "transform" / "seeds" / "film_log.csv"

# Unicode dashes differ between the export and the seed (en-dash vs hyphen).
DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−"), "-")


def norm_title(s: str) -> str:
    """Fold case, normalise unicode punctuation, strip non-word characters."""
    s = unicodedata.normalize("NFKC", s).translate(DASHES).casefold()
    return " ".join(re.sub(r"[^\w\s]", "", s).split())


def load_diary_years(zip_path: Path) -> dict[tuple[str, str], str]:
    """Map (normalised title, watched_date) -> Letterboxd release year."""
    with zipfile.ZipFile(zip_path) as zf:
        raw = zf.read("diary.csv").decode("utf-8-sig")

    years: dict[tuple[str, str], str] = {}
    for row in csv.DictReader(io.StringIO(raw)):
        watched = row["Watched Date"].strip()
        year = row["Year"].strip()
        if watched and year:
            years[(norm_title(row["Name"]), watched)] = year
    return years


def authoritative_years(log_rows: list[dict], diary_years: dict) -> dict[str, str]:
    """Map tmdb_id -> Letterboxd release year, via rows that match a diary entry."""
    years: dict[str, str] = {}
    for row in log_rows:
        key = (norm_title(row["title"]), row["watched_date"].strip())
        want = diary_years.get(key)
        tmdb_id = row["tmdb_id"].strip()
        if want and tmdb_id:
            years[tmdb_id] = want
    return years


def plan_repairs(log_rows: list[dict], diary_years: dict) -> list[tuple[int, dict, str]]:
    """Return (row_index, row, corrected_year) for every row needing a change.

    Corrections are keyed by tmdb_id, not by watch, because release_year is a
    property of the film. Sheet-era rows have no diary counterpart to match on,
    so matching per-watch would leave the same film holding two different years
    across rows — which makes dim_film.sql's `any_value(release_year)` (grouped
    by tmdb_id) nondeterministic. Propagating by tmdb_id keeps the seed
    internally consistent and makes this script idempotent.
    """
    years = authoritative_years(log_rows, diary_years)
    repairs = []
    for i, row in enumerate(log_rows):
        want = years.get(row["tmdb_id"].strip())
        if want and row["release_year"].strip() != want:
            repairs.append((i, row, want))
    return repairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="path to the Letterboxd export zip")
    parser.add_argument(
        "--apply", action="store_true", help="write changes (default: preview only)"
    )
    args = parser.parse_args()

    if not args.export.exists():
        print(f"no such file: {args.export}", file=sys.stderr)
        return 1

    diary_years = load_diary_years(args.export)

    with LOG_PATH.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        columns = reader.fieldnames or []
        log_rows = list(reader)

    repairs = plan_repairs(log_rows, diary_years)

    if not repairs:
        print("no release_year corrections needed")
        return 0

    deltas: dict[object, int] = defaultdict(int)
    print(f"{len(repairs)} release_year corrections:\n")
    for _, row, want in repairs:
        have = row["release_year"].strip()
        try:
            deltas[int(have) - int(want)] += 1
        except ValueError:
            deltas["non-numeric"] += 1
        print(f"  {row['watched_date']}  {row['title'][:46]:48} {have} -> {want}")

    spread = dict(sorted(deltas.items(), key=str))
    print(f"\n  delta distribution (film_log minus Letterboxd): {spread}")

    if not args.apply:
        print("\nDRY RUN — no changes written. Re-run with --apply to commit them.")
        return 0

    for i, _, want in repairs:
        log_rows[i]["release_year"] = want

    tmp = LOG_PATH.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, columns)
        writer.writeheader()
        writer.writerows(log_rows)
    tmp.replace(LOG_PATH)

    print(f"\napplied {len(repairs)} corrections to {LOG_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
