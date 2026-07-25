"""Build transform/seeds/watchlist.csv from the export plus resolved tmdb_ids.

The export's watchlist.csv is authoritative for what is currently on the watchlist,
but carries no tmdb_id — only Name, Year and a boxd.it URI. scripts/resolve_export.py
supplies the ids; this joins the two.

TV entries are dropped: this pipeline is films-only, and excluded_tv.csv records
which entries the film page identified as series.

Regenerates the seed wholesale rather than appending, because a watchlist is a
current-state list — films leave it when watched or removed. That is a deliberate
exception to the append-only seed rule, which exists for the watch LOG (history that
must never change), not for a mutable list.

Usage:
    uv run python scripts/build_watchlist_seed.py <export.zip>          # preview
    uv run python scripts/build_watchlist_seed.py <export.zip> --apply  # write
"""

import argparse
import csv
import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import dict_writer  # noqa: E402
from ingest.resolve_tmdb import normalise  # noqa: E402

RESOLVED = ROOT / "data" / "raw" / "letterboxd_export" / "resolved.csv"
EXCLUDED_TV = ROOT / "data" / "raw" / "letterboxd_export" / "excluded_tv.csv"
SEED = ROOT / "transform" / "seeds" / "watchlist.csv"

COLUMNS = ["tmdb_id", "title", "release_year", "added_date"]


def _index(path: Path) -> dict[tuple[str, str], str]:
    """(normalised title, year) -> tmdb_id from a resolver output file."""
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return {
            (normalise(row["title"]), row["year"].strip()): row["tmdb_id"].strip()
            for row in csv.DictReader(fh)
            if row.get("tmdb_id", "").strip()
        }


def build(zip_path: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    """Return (rows, unresolved, dropped_tv)."""
    with zipfile.ZipFile(zip_path) as zf:
        raw = zf.read("watchlist.csv").decode("utf-8-sig")

    resolved = _index(RESOLVED)
    tv = _index(EXCLUDED_TV)

    rows: list[dict] = []
    unresolved: list[tuple[str, str]] = []
    dropped_tv: list[str] = []
    seen: set[str] = set()

    for entry in csv.DictReader(io.StringIO(raw)):
        title = entry.get("Name", "").strip()
        year = entry.get("Year", "").strip()
        added = entry.get("Date", "").strip()
        if not (title and year):
            continue

        key = (normalise(title), year)
        if key in tv:
            dropped_tv.append(f"{title} ({year})")
            continue

        tmdb_id = resolved.get(key)
        if not tmdb_id:
            unresolved.append((title, year))
            continue
        if tmdb_id in seen:  # same film listed twice
            continue
        seen.add(tmdb_id)

        rows.append(
            {"tmdb_id": tmdb_id, "title": title, "release_year": year, "added_date": added}
        )

    rows.sort(key=lambda r: (r["added_date"], r["title"]))
    return rows, unresolved, dropped_tv


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--apply", action="store_true", help="write (default: preview)")
    args = parser.parse_args()

    if not args.export.exists():
        print(f"no such file: {args.export}", file=sys.stderr)
        return 1
    if not RESOLVED.exists():
        print(f"missing {RESOLVED} — run scripts/resolve_export.py first", file=sys.stderr)
        return 1

    rows, unresolved, dropped_tv = build(args.export)

    print(f"watchlist films : {len(rows)}")
    if dropped_tv:
        print(f"dropped as TV   : {len(dropped_tv)}  ({', '.join(dropped_tv)})")
    if unresolved:
        print(f"⚠️  unresolved  : {len(unresolved)}")
        for title, year in unresolved[:10]:
            print(f"      {title} ({year})")

    if rows:
        print(f"\ndate range: {rows[0]['added_date']} .. {rows[-1]['added_date']}")

    if not args.apply:
        print("\nDRY RUN — no seed written. Re-run with --apply.")
        return 0

    with SEED.open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nwrote {SEED.relative_to(ROOT)} ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
