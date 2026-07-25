"""One-off: add the `liked` column to film_log.csv from the Letterboxd export.

The RSS carries letterboxd:memberLike, so every watch ingested from now on records
its own like state. History has to come from the export's likes/films.csv.

⚠️ THE BACKFILL IS NOT POINT-IN-TIME. The export lists which films are liked *now*,
with the date the heart was set — not what the state was at each historical watch.
So backfilled rows carry today's like state applied retroactively. Rows ingested
going forward carry true per-watch state, which is the distinction that matters when
a film is disliked on first watch and liked on a rewatch.

Three values, and the third is load-bearing:
    true   - liked
    false  - watched during the Letterboxd era and not in the likes list
    ""     - UNKNOWN: pre-Letterboxd rows the export cannot speak to
Treating unknown as false would understate affection-rate denominators (W6).

Films are matched by tmdb_id where the export can be resolved to one via film_log's
existing (title, year) index; the export carries no ids of its own.

Usage:
    uv run python scripts/backfill_likes.py <export.zip>          # preview
    uv run python scripts/backfill_likes.py <export.zip> --apply  # write
"""

import argparse
import csv
import io
import re
import sys
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402

LOG_PATH = ROOT / "transform" / "seeds" / "film_log.csv"

# First watch logged on Letterboxd. Rows before this predate the platform, so the
# export's likes list cannot speak to them either way.
LETTERBOXD_ERA_START = "2019-12-21"

_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−"), "-")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s)).translate(_DASHES).casefold()
    return " ".join(re.sub(r"[^\w\s]", "", s).split())


def liked_titles(zip_path: Path) -> set[tuple[str, str]]:
    """(normalised title, year) for every film in likes/films.csv."""
    with zipfile.ZipFile(zip_path) as zf:
        raw = zf.read("likes/films.csv").decode("utf-8-sig")
    return {
        (norm(row["Name"]), row["Year"].strip())
        for row in csv.DictReader(io.StringIO(raw))
        if row.get("Name") and row.get("Year")
    }


def expand_renames(
    liked: set[tuple[str, str]], log_keys: set[tuple[str, str]]
) -> tuple[set[tuple[str, str]], list[tuple[tuple, tuple]]]:
    """Add film_log keys whose title merely got longer in a Letterboxd rename.

    Letterboxd shortens titles over time — the export says "Glass Onion" while
    film_log holds "Glass Onion: A Knives Out Mystery". An exact match misses
    these and would write liked=false for a film that IS liked.

    Only unambiguous, same-year prefix extensions are accepted: exactly one
    candidate, or nothing.
    """
    expanded = set(liked)
    aliases: list[tuple[tuple, tuple]] = []

    for liked_key in liked:
        if liked_key in log_keys:
            continue
        liked_title, liked_year = liked_key
        matches = [
            key for key in log_keys
            if key[1] == liked_year and key[0].startswith(liked_title + " ")
        ]
        if len(matches) == 1:
            expanded.add(matches[0])
            aliases.append((liked_key, matches[0]))

    return expanded, aliases


def plan(rows: list[dict], liked: set[tuple[str, str]]) -> list[tuple[int, str]]:
    """Return (row_index, liked_value) for every row, in file order."""
    out = []
    for i, row in enumerate(rows):
        watched = row["watched_date"].strip()
        if watched < LETTERBOXD_ERA_START:
            out.append((i, ""))  # unknown, not false
            continue
        key = (norm(row["title"]), row["release_year"].strip())
        out.append((i, "true" if key in liked else "false"))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--apply", action="store_true", help="write (default: preview)")
    args = parser.parse_args()

    if not args.export.exists():
        print(f"no such file: {args.export}", file=sys.stderr)
        return 1

    with LOG_PATH.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        columns = list(reader.fieldnames or [])
        rows = list(reader)

    if "liked" not in columns:
        columns.append("liked")

    original = liked_titles(args.export)
    print(f"export likes/films.csv : {len(original)} films")
    print(f"film_log               : {len(rows)} watches")

    log_keys = {(norm(r["title"]), r["release_year"].strip()) for r in rows}
    liked, aliases = expand_renames(original, log_keys)
    if aliases:
        print(f"\nmatched {len(aliases)} renamed title(s):")
        for (old_title, year), (new_title, _) in sorted(aliases):
            print(f"  '{old_title}' ({year})  ->  '{new_title}'")
    print()

    assignments = plan(rows, liked)
    counts = Counter(value or "unknown" for _, value in assignments)

    print("assignments:")
    for label in ("true", "false", "unknown"):
        print(f"  {label:8} {counts.get(label, 0):>5}")

    # A liked film is unmatched only if it hit neither an exact key nor a rename.
    aliased = {source for source, _ in aliases}
    unmatched = {k for k in original if k not in log_keys and k not in aliased}
    if unmatched:
        print(f"\n⚠️  {len(unmatched)} liked films did not match any film_log row")
        print("    (liked but never logged as a watch, or a title/year mismatch)")
        for title, year in sorted(unmatched)[:10]:
            print(f"      {title} ({year})")
        if len(unmatched) > 10:
            print(f"      ... and {len(unmatched) - 10} more")
    else:
        print("\nall liked films matched a film_log row")

    if not args.apply:
        print("\nDRY RUN — no changes written. Re-run with --apply.")
        return 0

    for i, value in assignments:
        rows[i]["liked"] = value

    tmp = LOG_PATH.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, columns)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(LOG_PATH)

    print(f"\napplied to {LOG_PATH.name} ({len(rows)} rows, column `liked` added)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
