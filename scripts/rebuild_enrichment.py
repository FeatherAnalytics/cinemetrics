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
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.geo import names_to_iso  # noqa: E402

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


def na(v) -> str:
    v = "" if v is None else str(v)
    return "" if v.strip() in ("", "N/A") else v.strip()


def digits(v) -> str:
    v = na(v)
    d = re.sub(r"[^0-9]", "", v)
    return d or ""


def as_float(v) -> str:
    v = na(v)
    try:
        return str(float(v)) if v else ""
    except ValueError:
        return ""


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


def tmdb_countries(t: dict) -> list[str]:
    out: list[str] = []
    for c in t.get("production_countries", []) or []:
        iso = c.get("iso_3166_1")
        if iso and iso not in out:
            out.append(iso)
    return out


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
            t_genres = ", ".join(g["name"] for g in t.get("genres", []))
            t_countries = tmdb_countries(t)

            o = {}
            op = OMDB / f"{imdb}.json"
            if imdb and op.exists():
                d = json.load(op.open(encoding="utf-8"))
                if d.get("Response") == "True":
                    o = d

            # Prefer OMDb; fall back to TMDB where OMDb is silent.
            rt = ""
            for r in o.get("Ratings", []):
                if r.get("Source") == "Rotten Tomatoes":
                    rt = digits(r.get("Value"))
            countries = names_to_iso(o.get("Country", "")) or t_countries

            seen[tid] = {
                "tmdb_id": tid,
                "imdb_id": imdb,
                "genres": na(o.get("Genre")) or t_genres,
                "keywords": ", ".join(
                    k["name"] for k in t.get("keywords", {}).get("keywords", [])
                ),
                "runtime": digits(o.get("Runtime"))
                or (str(t["runtime"]) if t.get("runtime") else ""),
                "budget": str(t["budget"]) if t.get("budget") else "",
                "revenue": str(t["revenue"]) if t.get("revenue") else "",
                "metascore": digits(o.get("Metascore")),
                "rt_rating": rt,
                "imdb_rating": as_float(o.get("imdbRating")),
                "imdb_votes": digits(o.get("imdbVotes")),
                "box_office": digits(o.get("BoxOffice")),
                "director": na(o.get("Director")),
                "actors": na(o.get("Actors")),
                "rated": na(o.get("Rated")),
                "production_countries": ", ".join(countries),
                # TMDB-only: original language (ISO 639-1) and franchise/collection.
                "original_language": na(t.get("original_language")),
                "collection": na((t.get("belongs_to_collection") or {}).get("name")),
            }

    rows = sorted(seen.values(), key=lambda r: int(r["tmdb_id"]))
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    n_country = sum(1 for r in rows if r["production_countries"])
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} films, {n_country} with countries")


if __name__ == "__main__":
    main()
