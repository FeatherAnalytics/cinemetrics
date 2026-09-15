"""Backfill source and rename ok -> ok_legacy on the candidate seed.

Sets source=legacy and renames omdb_status=ok to ok_legacy on all existing
rows so the re-verify pass can check their OMDb Type without treating them
as already settled.

    uv run python scripts/backfill_candidate_source.py           # preview
    uv run python scripts/backfill_candidate_source.py --apply   # rewrite seed
"""

import csv
import sys
from pathlib import Path

from ingest.csvio import write_rows
from ingest.enrich import CANDIDATE_CSV_COLUMNS

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "transform" / "seeds" / "candidate_enrichment.csv"


def main() -> None:
    apply = "--apply" in sys.argv

    with SEED.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    renamed = 0
    sourced = 0
    for row in rows:
        if row.get("omdb_status") == "ok":
            row["omdb_status"] = "ok_legacy"
            renamed += 1
        if not row.get("source"):
            row["source"] = "legacy"
            sourced += 1

    print(f"ok -> ok_legacy: {renamed}")
    print(f"source = legacy: {sourced}")

    if apply:
        write_rows(SEED, rows, CANDIDATE_CSV_COLUMNS, strict=True)
        print(f"wrote {SEED.name}")
    else:
        print("dry run; pass --apply to write")


if __name__ == "__main__":
    main()
