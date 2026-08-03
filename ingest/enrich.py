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

# Base columns shared by every enrichment CSV, in order. This list defines the
# order of the row dict AND, via FILM_CSV_COLUMNS, the column order of
# film_enrichment.csv — the seeds are diffed in git, so the order is part of
# the data's contract and is not safe to shuffle.
BASE_COLUMNS = [
    "tmdb_id", "imdb_id", "genres", "keywords", "runtime", "budget", "revenue",
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated", "production_countries", "poster_path",
]
# Extra TMDB-only columns for the candidate/rebuild variants.
LANG_COLLECTION_COLUMNS = ["original_language", "collection"]

# The column order of transform/seeds/film_enrichment.csv.
FILM_CSV_COLUMNS = BASE_COLUMNS + LANG_COLLECTION_COLUMNS

# The column order of transform/seeds/candidate_enrichment.csv, which is NOT the
# same file schema despite being built by the same row builder.
#
# It carries four columns the film seed does not (title, release_date,
# tmdb_rating, tmdb_votes) and puts poster_path last rather than mid-row. Its
# order is fixed by the 7,770 rows already committed, so it is dictated by the
# file rather than derived from BASE_COLUMNS — deriving it is what shifted
# poster_path into original_language.
#
# A single shared list here was a real corruption bug, not a near miss:
# test_writer_columns_match_the_seed_header pins both against the bytes on disk.
CANDIDATE_CSV_COLUMNS = [
    "tmdb_id", "imdb_id", "genres", "keywords", "runtime", "budget", "revenue",
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated", "production_countries",
    "original_language", "collection",
    "title", "release_date", "tmdb_rating", "tmdb_votes",
    "poster_path",
]

# The candidate-only columns. TMDB serves all four in the detail payload the
# candidate writers already fetch, so nothing extra is called for them.
CANDIDATE_META_COLUMNS = ["title", "release_date", "tmdb_rating", "tmdb_votes"]

# The columns only OMDb can fill. Deliberately excludes genres, runtime and
# production_countries: build_enrichment_row falls back to TMDB for those, so
# they are populated whether or not OMDb answered and say nothing about it.
#
# A row with none of these has no OMDb data at all, which is what
# fetch_candidates.py uses to decide a candidate is not finished yet.
OMDB_SOURCED_COLUMNS = [
    "metascore", "rt_rating", "imdb_rating", "imdb_votes", "box_office",
    "director", "actors", "rated",
]


def has_omdb_data(row: dict[str, str]) -> bool:
    """True when a row carries anything OMDb supplied.

    The inverse is the retry condition. It holds for two different rows that
    both need another attempt: one whose OMDb call never landed, and one whose
    TMDB record carried no imdb_id to call OMDb with in the first place.
    """
    return any((row.get(column) or "").strip() for column in OMDB_SOURCED_COLUMNS)


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
    include_candidate_meta: bool = False,
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
    include_candidate_meta  True  -> emit title/release_date/tmdb_rating/
                                    tmdb_votes (candidate_enrichment.csv only).
                           False -> omit them (film_enrichment.csv has no such
                                    columns).
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

    # TMDB image path, e.g. "/abc123.jpg". Stored as the path, not a URL: the
    # CDN host and size segment belong to the renderer, not the data.
    #
    # Emitted for every caller, because both enrichment seeds carry the column.
    # Where they differ is its POSITION -- mid-row in FILM_CSV_COLUMNS, last in
    # CANDIDATE_CSV_COLUMNS -- and position is the column list's business, not
    # the row builder's.
    row["poster_path"] = tmdb.get("poster_path") or ""

    if include_lang_collection:
        # fetch_candidates.py reads these raw; rebuild_enrichment.py cleans them.
        if strip_text:
            row["original_language"] = na_clean(tmdb.get("original_language"))
            row["collection"] = na_clean((tmdb.get("belongs_to_collection") or {}).get("name"))
        else:
            row["original_language"] = tmdb.get("original_language", "")
            row["collection"] = (tmdb.get("belongs_to_collection") or {}).get("name", "")

    if include_candidate_meta:
        # Every one of these was added to the seed by a one-off backfill while
        # the writers kept omitting it, so each new candidate landed nameless and
        # scoreless. The detail payload already in hand answers all four.
        row["title"] = tmdb.get("title") or tmdb.get("original_title") or ""
        row["release_date"] = tmdb.get("release_date") or ""
        # A film nobody has voted on reports 0.0, which is the absence of a score
        # rather than a bad one. Blank both fields instead of recording a zero.
        avg = tmdb.get("vote_average") or 0
        votes = tmdb.get("vote_count") or 0
        row["tmdb_rating"] = f"{avg:.1f}" if avg and votes else ""
        row["tmdb_votes"] = str(votes) if votes else ""

    return row
