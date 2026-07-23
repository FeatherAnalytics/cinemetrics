"""Atomic append for the committed seed CSVs.

scripts/update.py previously appended in "a" mode with no header and no
atomicity — an interrupted run could leave a truncated seed. ``append_rows``
writes existing content plus the new rows to a temp file in the same directory,
then ``os.replace`` swaps it in atomically. A header is written when the target
is new or empty (matching the guard scripts/fetch_candidates.py already used).
"""

import csv
import os
from pathlib import Path


def append_rows(path: Path, rows: list[dict], columns: list[str]) -> None:
    """Atomically append ``rows`` to the CSV at ``path``.

    - Writes a header row when the target does not exist or is empty.
    - Ignores dict keys not in ``columns`` (csv.DictWriter extrasaction="ignore").
    - No-op when ``rows`` is empty (never creates a header-only file).
    """
    if not rows:
        return

    path = Path(path)
    has_content = path.exists() and path.stat().st_size > 0

    tmp = path.with_name(f"{path.name}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8", newline="") as out:
            if has_content:
                # Preserve existing bytes verbatim (header + prior rows).
                with open(path, encoding="utf-8", newline="") as src:
                    out.write(src.read())
            writer = csv.DictWriter(out, fieldnames=columns, extrasaction="ignore")
            if not has_content:
                writer.writeheader()
            writer.writerows(rows)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()
