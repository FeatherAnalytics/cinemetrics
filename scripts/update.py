"""Full auto-update: RSS -> enrich new films -> dbt deps + build -> export JSON."""

import csv
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.csvio import append_rows  # noqa: E402
from ingest.enrich import FILM_CSV_COLUMNS, build_enrichment_row  # noqa: E402
from ingest.http import omdb_get, tmdb_get  # noqa: E402
from ingest.poster_slice import slice_for_poster  # noqa: E402

SEEDS = ROOT / "transform" / "seeds"
TRANSFORM = ROOT / "transform"
LOG_PATH = SEEDS / "film_log.csv"
ENRICH_PATH = SEEDS / "film_enrichment.csv"
SLICES_PATH = SEEDS / "poster_slices.csv"
SLICE_COLUMNS = ["tmdb_id", "slice"]

TMDB_KEY = os.environ.get("TMDB_API_KEY", "")
OMDB_KEY = os.environ.get("OMDB_API_KEY", "")
LETTERBOXD_USER = os.environ.get("LETTERBOXD_USER", "")

LOG_COLUMNS = [
    "watched_date",
    "tmdb_id",
    "imdb_id",
    "title",
    "release_year",
    "my_rating",
    "star_rating",
    "is_rewatch",
    # Per-watch like state from letterboxd:memberLike. Empty means unknown
    # (pre-Letterboxd rows), which is distinct from "false".
    "liked",
]


def _existing_enrichment_tmdb_ids() -> set[str]:
    ids: set[str] = set()
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid = row.get("tmdb_id", "").strip()
            if tid:
                ids.add(tid)
    return ids


def enrich_film(tmdb_id: str) -> dict[str, str] | None:
    """Fetch TMDB + OMDb data for a single film, return enrichment row.

    Returns None when the TMDB detail lookup fails, so the caller can hold back
    the corresponding watch instead of logging it without enrichment.
    """
    movie = tmdb_get(f"movie/{tmdb_id}", api_key=TMDB_KEY, append_to_response="keywords")
    if not movie.get("id"):
        return None
    ext = tmdb_get(f"movie/{tmdb_id}/external_ids", api_key=TMDB_KEY)
    imdb_id = ext.get("imdb_id", "")

    # OMDb is preferred for everything it reports.
    omdb: dict = omdb_get(imdb_id, api_key=OMDB_KEY) if imdb_id and OMDB_KEY else {}
    if omdb.get("Response") != "True":
        omdb = {}

    return build_enrichment_row(
        movie,
        omdb,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        prefer_omdb=True,
        omdb_countries=True,
        include_lang_collection=True,
    )


def loggable_watches(
    watches: list[dict],
    existing_enrich_ids: set[str],
    enriched_ids: set[str],
) -> list[dict]:
    """Keep only watches whose film enrichment is present.

    A watch is loggable when its tmdb_id was already enriched or was enriched
    successfully in this run. Input order is preserved.
    """
    covered = existing_enrich_ids | enriched_ids
    return [w for w in watches if w["tmdb_id"] in covered]


def append_to_enrichment(rows: list[dict[str, str]]) -> None:
    append_rows(ENRICH_PATH, rows, FILM_CSV_COLUMNS, strict=True)


def append_to_slices(rows: list[dict[str, str]]) -> None:
    """Append a poster slice for each newly enriched film.

    Without this the barcode draws a blank stripe for everything watched after
    the backfill ran. A failure here must NOT hold the watch back: the film is
    fully enriched either way, and backfill_poster_slices.py is idempotent, so a
    missing slice is repaired on the next run rather than lost.
    """
    new: list[dict[str, str]] = []
    for row in rows:
        try:
            encoded = slice_for_poster(row.get("poster_path", ""))
        except Exception as e:  # noqa: BLE001
            print(f"  WARNING: poster slice failed for tmdb_id={row['tmdb_id']}: {e}")
            continue
        if encoded:
            new.append({"tmdb_id": row["tmdb_id"], "slice": encoded})
    if new:
        append_rows(SLICES_PATH, new, SLICE_COLUMNS)
        print(f"  appended {len(new)} poster slices")


def append_to_log(watches: list[dict]) -> None:
    append_rows(LOG_PATH, watches, LOG_COLUMNS)


def main() -> None:
    if not LETTERBOXD_USER:
        raise SystemExit("LETTERBOXD_USER not set in .env")
    if not TMDB_KEY:
        raise SystemExit("TMDB_API_KEY not set in .env")

    # Import here to avoid circular issues at module level
    sys.path.insert(0, str(ROOT))
    from ingest.letterboxd import fetch_new_watches

    print(f"Fetching RSS for {LETTERBOXD_USER} ...")
    new_watches = fetch_new_watches(LETTERBOXD_USER, LOG_PATH)

    if not new_watches:
        print("No new watches found.")
        return

    if len(new_watches) > 50:
        print(f"WARNING: {len(new_watches)} new watches detected. Possible parse error. Aborting.")
        sys.exit(1)

    print(f"Found {len(new_watches)} new watches.")

    # Enrich new films
    existing_tmdb = _existing_enrichment_tmdb_ids()
    new_films: list[dict[str, str]] = []
    enriched_ids: set[str] = set()
    new_tmdb_ids = {w["tmdb_id"] for w in new_watches} - existing_tmdb

    for tid in sorted(new_tmdb_ids):
        print(f"  Enriching tmdb_id={tid} ...")
        row = enrich_film(tid)
        if row is None:
            print(f"  WARNING: enrichment failed for tmdb_id={tid}; watch held back.")
            continue
        new_films.append(row)
        enriched_ids.add(tid)
        # Populate imdb_id back into watches that need it
        for w in new_watches:
            if w["tmdb_id"] == tid and not w.get("imdb_id"):
                w["imdb_id"] = row.get("imdb_id", "")

    # Append enrichment BEFORE the watch log so a watch is never logged without
    # its enrichment. Only log watches whose film enrichment is present.
    if new_films:
        append_to_enrichment(new_films)
        append_to_slices(new_films)

    watches_to_log = loggable_watches(new_watches, existing_tmdb, enriched_ids)

    # Ensure all watches have imdb_id from enrichment
    enrich_imdb: dict[str, str] = {}
    with open(ENRICH_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            enrich_imdb[row.get("tmdb_id", "")] = row.get("imdb_id", "")
    for w in watches_to_log:
        if not w.get("imdb_id"):
            w["imdb_id"] = enrich_imdb.get(w["tmdb_id"], "")

    append_to_log(watches_to_log)

    # dbt deps, then build.
    #
    # `deps` is not optional here and its absence is what broke the scheduled run on
    # 2026-07-26 and 2026-07-27: `transform/dbt_packages/` is gitignored, so a fresh
    # CI checkout has no dbt_utils and `dbt build` fails compilation before touching a
    # model. The workflow does run `dbt deps` in a later step, which never helped,
    # because this call happens first and aborts the job.
    #
    # Belongs here rather than in the workflow: this function owns the dbt
    # invocation, so anywhere it runs -- CI, cron, a local shell -- gets a working
    # one. Idempotent and cheap when the package is already present.
    print("Running dbt deps ...")
    subprocess.run(
        ["uv", "run", "dbt", "deps", "--profiles-dir", "."],
        cwd=str(TRANSFORM),
        check=True,
    )

    print("Running dbt build ...")
    subprocess.run(
        ["uv", "run", "dbt", "build", "--profiles-dir", "."],
        cwd=str(TRANSFORM),
        check=True,
    )

    # Export JSON
    print("Exporting web JSON ...")
    subprocess.run(
        ["uv", "run", "python", "scripts/export_web.py"],
        cwd=str(ROOT),
        check=True,
    )

    print(f"Added {len(watches_to_log)} watches, {len(new_films)} new films.")


if __name__ == "__main__":
    main()
