"""Resolve Letterboxd export films to tmdb_ids.

The export identifies films only by boxd.it URI, Name and Year. Watched films are
already resolved — film_log carries their ids — so this only has to search TMDB for
the watchlist and for list entries never watched.

Two outputs:
  data/raw/letterboxd_export/resolved.csv  - confident matches
  data/raw/letterboxd_export/review.csv    - unresolved or ambiguous, for a human

Nothing is written to transform/seeds/ — seed generation is a separate, reviewable
step, and a wrong tmdb_id is undetectable once it reaches a mart.

Usage:
    uv run python scripts/resolve_export.py <export.zip> [--limit N]
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

import requests  # noqa: E402

from ingest.csvio import dict_writer  # noqa: E402
from ingest.http import tmdb_get  # noqa: E402
from ingest.letterboxd_film_page import (  # noqa: E402
    FilmPageBlocked,
    FilmPageError,
    FilmPageIds,
    fetch_film_ids,
)
from ingest.resolve_tmdb import Resolution, normalise, resolve  # noqa: E402

SEEDS = ROOT / "transform" / "seeds"
OUT_DIR = ROOT / "data" / "raw" / "letterboxd_export"
CACHE = ROOT / "data" / "raw" / "tmdb_search"
TMDB_KEY = os.environ.get("TMDB_API_KEY", "")


def _cached(endpoint: str, title: str, year: str | None, year_param: str) -> list[dict]:
    prefix = "tv_" if endpoint.endswith("/tv") else ""
    slug = re.sub(r"[^a-z0-9]+", "_", normalise(title))[:60]
    cache_file = CACHE / f"{prefix}{slug}__{year or 'noyear'}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    params = {"query": title}
    if year:
        params[year_param] = year
    results = tmdb_get(endpoint, api_key=TMDB_KEY, **params).get("results", [])
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(results), encoding="utf-8")
    return results


def cached_search(title: str, year: str | None) -> list[dict]:
    """TMDB film search, cached to disk so re-runs cost nothing."""
    return _cached("search/movie", title, year, "year")


def from_film_page(uri: str) -> FilmPageIds | None:
    """Authoritative fallback: read the ids straight off the Letterboxd film page.

    Preferred over any TMDB-search heuristic for the residue, because the page
    states both the id AND whether the entry is a film or a TV series — the
    distinction this films-only pipeline needs. Returns None if the page cannot
    be reached, so a network failure degrades to review rather than a bad id.
    """
    if not uri:
        return None
    try:
        return fetch_film_ids(uri)
    except FilmPageBlocked as err:
        print(f"  blocked: {err}")
        return None
    except (FilmPageError, requests.RequestException) as err:
        print(f"  film page failed for {uri}: {err}")
        return None


def read_member(zf: zipfile.ZipFile, name: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(zf.read(name).decode("utf-8-sig"))))


def read_list(zf: zipfile.ZipFile, name: str) -> tuple[str, list[dict]]:
    """Parse a list export: metadata block, blank line, then the film rows.

    Format (v7):
        Letterboxd list export v7
        Date,Name,Tags,URL,Description      <- list metadata header
        2024-10-02,spooktober 2024,,...     <- list metadata
                                            <- blank
        Position,Name,Year,URL,Description  <- film header
        1,Suspiria,1977,...
    """
    lines = zf.read(name).decode("utf-8-sig").splitlines()
    blank = next((i for i, ln in enumerate(lines) if not ln.strip()), None)
    if blank is None:
        return name, []

    meta = list(csv.DictReader(io.StringIO("\n".join(lines[1:blank]))))
    list_name = meta[0].get("Name", name) if meta else name
    films = list(csv.DictReader(io.StringIO("\n".join(lines[blank + 1:]))))
    return list_name, films


def local_index() -> dict[tuple[str, str], str]:
    """(normalised title, year) -> tmdb_id, from films already in the pipeline."""
    index: dict[tuple[str, str], str] = {}
    log = SEEDS / "film_log.csv"
    if log.exists():
        for row in csv.DictReader(log.open(encoding="utf-8")):
            tmdb_id = row.get("tmdb_id", "").strip()
            title = row.get("title", "").strip()
            year = row.get("release_year", "").strip()
            if tmdb_id and title and year:
                index[(normalise(title), year)] = tmdb_id
    return index


def collect(zip_path: Path) -> dict[tuple[str, str], dict]:
    """Gather every (title, year) needing an id, with its sources and boxd.it URI.

    The URI is what makes the film-page fallback possible: it resolves to the exact
    Letterboxd page, whose outbound TMDB anchor is authoritative. Watchlist rows
    name the column "Letterboxd URI"; list rows call it "URL".
    """
    wanted: dict[tuple[str, str], dict] = {}

    def add(title: str, year: str, source: str, uri: str) -> None:
        title, year = title.strip(), year.strip()
        if not (title and year):
            return
        entry = wanted.setdefault((title, year), {"sources": [], "uri": ""})
        entry["sources"].append(source)
        if uri and not entry["uri"]:
            entry["uri"] = uri.strip()

    with zipfile.ZipFile(zip_path) as zf:
        for row in read_member(zf, "watchlist.csv"):
            add(
                row.get("Name", ""), row.get("Year", ""),
                "watchlist", row.get("Letterboxd URI", ""),
            )

        for name in sorted(n for n in zf.namelist() if n.startswith("lists/")):
            list_name, films = read_list(zf, name)
            for row in films:
                add(
                    row.get("Name", ""), row.get("Year", ""),
                    f"list:{list_name}", row.get("URL", ""),
                )

    return wanted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="path to the Letterboxd export zip")
    parser.add_argument("--limit", type=int, help="resolve only the first N (for a dry run)")
    args = parser.parse_args()

    if not TMDB_KEY:
        print("TMDB_API_KEY not set", file=sys.stderr)
        return 1
    if not args.export.exists():
        print(f"no such file: {args.export}", file=sys.stderr)
        return 1

    wanted = collect(args.export)
    known = local_index()
    print(f"{len(wanted)} unique (title, year) pairs across watchlist + lists")
    print(f"{len(known)} films already resolved in film_log\n")

    items = sorted(wanted.items())
    if args.limit:
        items = items[: args.limit]

    resolved_rows, review_rows, tv_rows = [], [], []
    strategies = Counter()

    for i, ((title, year), entry) in enumerate(items, 1):
        sources = "|".join(sorted(set(entry["sources"])))

        local = known.get((normalise(title), year))
        if local:
            strategies["local"] += 1
            resolved_rows.append(
                {
                    "tmdb_id": local, "title": title, "year": year,
                    "strategy": "local", "sources": sources,
                }
            )
            continue

        got: Resolution = resolve(title, year, search=cached_search)
        row = {
            "tmdb_id": got.tmdb_id or "", "title": title, "year": year,
            "strategy": got.strategy, "sources": sources,
        }

        # Title search failed or is not clear-cut. The film page settles it
        # outright: it names the id AND says whether the entry is film or TV.
        if got.needs_review:
            page = from_film_page(entry["uri"])
            if page and page.content_type == "tv":
                strategies["tv_excluded"] += 1
                tv_rows.append({**row, "tmdb_id": page.tmdb_id, "strategy": "tv_excluded"})
                continue
            if page and page.is_film:
                strategies["film_page"] += 1
                resolved_rows.append(
                    {**row, "tmdb_id": page.tmdb_id, "strategy": "film_page"}
                )
                continue

        strategies[got.strategy] += 1
        if got.needs_review:
            row["runners_up"] = "; ".join(
                f"{c['title']} ({c['year']}) id={c['tmdb_id']} votes={c['votes']}"
                for c in got.runners_up
            )
            review_rows.append(row)
        else:
            resolved_rows.append(row)

        if i % 50 == 0:
            print(f"  {i}/{len(items)} ...", flush=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cols = ["tmdb_id", "title", "year", "strategy", "sources"]

    with (OUT_DIR / "resolved.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, cols)
        writer.writeheader()
        writer.writerows(resolved_rows)

    with (OUT_DIR / "review.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, [*cols, "runners_up"])
        writer.writeheader()
        writer.writerows(review_rows)

    with (OUT_DIR / "excluded_tv.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = dict_writer(fh, cols)
        writer.writeheader()
        writer.writerows(tv_rows)

    total = len(items)
    print("\n" + "=" * 62)
    print(f"resolved confidently : {len(resolved_rows)}  ({len(resolved_rows)/total:.1%})")
    print(f"excluded as TV       : {len(tv_rows)}  ({len(tv_rows)/total:.1%})")
    print(f"needs review         : {len(review_rows)}  ({len(review_rows)/total:.1%})")
    print("\nby strategy:")
    for strategy, n in strategies.most_common():
        print(f"  {strategy:18} {n:>5}")
    print(f"\n-> {OUT_DIR / 'resolved.csv'}")
    print(f"-> {OUT_DIR / 'review.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
