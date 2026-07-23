"""Build an enrichment CSV row from a TMDB detail dict + an OMDb dict.

Consolidates the three row builders that were duplicated across:
  - scripts/update.py:enrich_film            (film_enrichment.csv, 18 cols)
  - scripts/fetch_candidates.py:_enrich_tmdb (candidate_enrichment.csv, 18 cols)
  - scripts/rebuild_enrichment.py:main       (film_enrichment.csv full, 18 cols)

The three callers differ in which source wins for genres/runtime/countries and
which columns they emit. Those differences are expressed as flags so the output
stays byte-identical to each original builder. Column order is preserved.
"""

from ingest.geo import names_to_iso
from ingest.parse import float_or_empty, int_or_empty, na_clean, na_empty

# Base columns shared by every enrichment CSV, in order.
BASE_COLUMNS = [
    "tmdb_id", "imdb_id", "genres", "keywords", "runtime", "budget", "revenue",
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated", "production_countries",
]
# Extra TMDB-only columns for the candidate/rebuild variants.
LANG_COLLECTION_COLUMNS = ["original_language", "collection"]


def _tmdb_genres(tmdb: dict) -> str:
    return ", ".join(g["name"] for g in tmdb.get("genres", []))


def _tmdb_keywords(tmdb: dict) -> str:
    return ", ".join(k["name"] for k in tmdb.get("keywords", {}).get("keywords", []))


def _tmdb_iso_split(tmdb: dict) -> list[str]:
    """update.py fallback: join non-empty ISO codes, then split — no dedup."""
    joined = ", ".join(
        c["iso_3166_1"] for c in tmdb.get("production_countries", []) if c.get("iso_3166_1")
    )
    return joined.split(", ") if joined else []


def _tmdb_iso_dedup(tmdb: dict) -> list[str]:
    """rebuild_enrichment.py fallback: de-duplicated ISO list."""
    out: list[str] = []
    for c in tmdb.get("production_countries", []) or []:
        iso = c.get("iso_3166_1")
        if iso and iso not in out:
            out.append(iso)
    return out


def _rt_rating(omdb: dict) -> str:
    for r in omdb.get("Ratings", []):
        if r.get("Source") == "Rotten Tomatoes":
            return int_or_empty(r.get("Value"))
    return ""


def build_enrichment_row(
    tmdb: dict,
    omdb: dict,
    *,
    tmdb_id: str,
    imdb_id: str,
    prefer_omdb: bool,
    omdb_countries: bool,
    include_lang_collection: bool,
    strip_text: bool = False,
) -> dict[str, str]:
    """Map a TMDB detail + OMDb dict to an enrichment row.

    prefer_omdb            True  -> OMDb wins for genres/runtime (TMDB fallback);
                                    countries come from OMDb Country names.
                           False -> TMDB is the sole source (candidate pool).
    omdb_countries         True  -> names_to_iso(OMDb.Country) or TMDB fallback.
                           False -> raw TMDB ISO join (candidate pool).
    include_lang_collection True -> append original_language + collection (TMDB).
    strip_text             True  -> strip text fields (rebuild_enrichment.py).
                           False -> preserve text as-is (update/fetch_candidates).
    """
    text = na_clean if strip_text else na_empty
    tmdb_genres = _tmdb_genres(tmdb)

    if prefer_omdb:
        genres = text(omdb.get("Genre")) or tmdb_genres
        runtime = int_or_empty(omdb.get("Runtime")) or (
            str(tmdb.get("runtime")) if tmdb.get("runtime") else ""
        )
    else:
        genres = tmdb_genres
        runtime = str(tmdb.get("runtime") or "")

    if omdb_countries:
        # OMDb names -> ISO; fall back to TMDB ISO list.
        # update.py uses the split (non-dedup) fallback; rebuild uses dedup.
        fallback = _tmdb_iso_dedup(tmdb) if strip_text else _tmdb_iso_split(tmdb)
        countries = ", ".join(names_to_iso(omdb.get("Country", "")) or fallback)
    else:
        # Candidate pool: raw TMDB ISO join (no filter, no dedup).
        countries = ", ".join(
            c["iso_3166_1"] for c in tmdb.get("production_countries", [])
        )

    row: dict[str, str] = {
        "tmdb_id": tmdb_id,
        "imdb_id": imdb_id,
        "genres": genres,
        "keywords": _tmdb_keywords(tmdb),
        "runtime": runtime,
        "budget": str(tmdb.get("budget")) if tmdb.get("budget") else "",
        "revenue": str(tmdb.get("revenue")) if tmdb.get("revenue") else "",
        "metascore": int_or_empty(omdb.get("Metascore")),
        "rt_rating": _rt_rating(omdb),
        "imdb_rating": float_or_empty(omdb.get("imdbRating")),
        "imdb_votes": int_or_empty(omdb.get("imdbVotes")),
        "box_office": int_or_empty(omdb.get("BoxOffice")),
        "director": text(omdb.get("Director")),
        "actors": text(omdb.get("Actors")),
        "rated": text(omdb.get("Rated")),
        "production_countries": countries,
    }

    if include_lang_collection:
        # fetch_candidates.py reads these raw; rebuild_enrichment.py cleans them.
        if strip_text:
            row["original_language"] = na_clean(tmdb.get("original_language"))
            row["collection"] = na_clean((tmdb.get("belongs_to_collection") or {}).get("name"))
        else:
            row["original_language"] = tmdb.get("original_language", "")
            row["collection"] = (tmdb.get("belongs_to_collection") or {}).get("name", "")

    return row
