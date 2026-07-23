"""Rebuild film_enrichment.csv, preferring OMDb where both sources overlap.

Sources (all read from cache; run the recon/update flow first to populate):
  OMDb  (data/raw/omdb/{imdb_id}.json)  -> genres, runtime, director, actors,
        box_office, metascore, rt_rating, imdb_rating, imdb_votes, rated,
        production_countries (Country names -> ISO). This is the preferred source.
  TMDB  (data/raw/tmdb/*.json)           -> keywords, budget, revenue (OMDb has
        none of these), plus genres/runtime/countries as fallback only.
"""

import csv
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.enrich import build_enrichment_row  # noqa: E402

OMDB = ROOT / "data" / "raw" / "omdb"
TMDB = ROOT / "data" / "raw" / "tmdb"
LOG = ROOT / "transform" / "seeds" / "film_log.csv"
OUT = ROOT / "transform" / "seeds" / "film_enrichment.csv"

COLUMNS = [
    "tmdb_id", "imdb_id", "genres", "keywords", "runtime", "budget", "revenue",
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated", "production_countries",
    "original_language", "collection",
]


def tmdb_by_id() -> dict[int, dict]:
    idx: dict[int, dict] = {}
    for p in glob.glob(str(TMDB / "*.json")):
        try:
            d = json.load(open(p, encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if d.get("id") is not None:
            idx[int(d["id"])] = d
    return idx


def main() -> None:
    tmdb = tmdb_by_id()

    seen: dict[str, dict[str, str]] = {}  # tmdb_id -> row
    with open(LOG, encoding="utf-8") as f:
        for w in csv.DictReader(f):
            tid = w["tmdb_id"].strip()
            imdb = w["imdb_id"].strip()
            if not tid or tid in seen:
                continue

            t = tmdb.get(int(tid), {}) if tid.isdigit() else {}

            o = {}
            op = OMDB / f"{imdb}.json"
            if imdb and op.exists():
                d = json.load(op.open(encoding="utf-8"))
                if d.get("Response") == "True":
                    o = d

            seen[tid] = build_enrichment_row(
                t,
                o,
                tmdb_id=tid,
                imdb_id=imdb,
                prefer_omdb=True,
                omdb_countries=True,
                include_lang_collection=True,
                strip_text=True,
            )

    rows = sorted(seen.values(), key=lambda r: int(r["tmdb_id"]))
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    n_country = sum(1 for r in rows if r["production_countries"])
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} films, {n_country} with countries")


if __name__ == "__main__":
    main()
