"""Backfill the omdb_status column on the candidate enrichment seed.

Sets the status from what the data already implies so the first nightly after
the column ships does not re-spend ~9k OMDb calls learning what the seed says.

    uv run python scripts/backfill_omdb_status.py           # preview
    uv run python scripts/backfill_omdb_status.py --apply   # rewrite seed
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.csvio import write_rows  # noqa: E402
from ingest.enrich import CANDIDATE_CSV_COLUMNS, has_omdb_data  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "transform" / "seeds" / "candidate_enrichment.csv"
OMDB_CACHE = ROOT / "data" / "raw" / "omdb"


def main() -> None:
    import csv

    apply = "--apply" in sys.argv

    with open(SEED, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    counts = {"ok": 0, "no_imdb_id": 0, "not_a_film": 0, "skipped": 0}
    for row in rows:
        existing = row.get("omdb_status", "").strip()
        if existing:
            continue

        if has_omdb_data(row):
            imdb_id = (row.get("imdb_id") or "").strip()
            cache_file = OMDB_CACHE / f"{imdb_id}.json" if imdb_id else None
            if cache_file and cache_file.exists():
                data = json.loads(cache_file.read_text(encoding="utf-8"))
                omdb_type = data.get("Type", "movie")
                if omdb_type != "movie":
                    row["omdb_status"] = "not_a_film"
                    counts["not_a_film"] += 1
                    continue
            row["omdb_status"] = "ok"
            counts["ok"] += 1
        elif not (row.get("imdb_id") or "").strip():
            row["omdb_status"] = "no_imdb_id"
            counts["no_imdb_id"] += 1
        else:
            counts["skipped"] += 1

    print(f"ok: {counts['ok']}, no_imdb_id: {counts['no_imdb_id']}, "
          f"not_a_film: {counts['not_a_film']}, left blank: {counts['skipped']}")

    if apply:
        write_rows(SEED, rows, CANDIDATE_CSV_COLUMNS, strict=True)
        print(f"wrote {SEED.name}")
    else:
        print("dry run; pass --apply to write")


if __name__ == "__main__":
    main()
