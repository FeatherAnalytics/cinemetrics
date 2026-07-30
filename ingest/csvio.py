"""Atomic append for the committed seed CSVs, with newline discipline.

scripts/update.py previously appended in "a" mode with no header and no
atomicity — an interrupted run could leave a truncated seed. ``append_rows``
writes existing content plus the new rows to a temp file in the same directory,
then ``os.replace`` swaps it in atomically. A header is written when the target
is new or empty (matching the guard scripts/fetch_candidates.py already used).

LINE ENDINGS — the cause of a long-running, intermittent bug. `.gitattributes`
declares `* text=auto eol=lf`, so git checks the seeds out with LF on every
platform. But Python's csv module defaults to ``lineterminator="\\r\\n"`` and
emits CRLF everywhere, macOS included. Appending to a freshly-checked-out seed
therefore produced a file with LF history and CRLF new rows, and DuckDB's CSV
sniffer refuses a mixed-ending file outright:

    Invalid Input Error: Error when sniffing file "film_log.csv"
    It was not possible to automatically detect the CSV parsing dialect

The failure only appeared after new watches were appended to a clean checkout,
which is why it kept resurfacing and looked platform-specific.

Every CSV writer in this repo must therefore go through ``dict_writer`` (or pass
``lineterminator=LINE_TERMINATOR``) so committed data stays LF-only.
"""

import csv
import os
from collections.abc import Callable
from pathlib import Path
from typing import TextIO

# LF, matching `.gitattributes`. Never rely on the csv module's CRLF default.
LINE_TERMINATOR = "\n"


def dict_writer(fh: TextIO, columns: list[str], *, strict: bool = False) -> csv.DictWriter:
    """A DictWriter that writes LF line endings.

    Open ``fh`` with ``newline=""`` so the terminator set here reaches the file
    without the text layer translating it.

    strict=False keeps DictWriter's extrasaction="ignore" behaviour (extra keys
    are dropped); pass strict=True to raise on unexpected keys instead.
    """
    return csv.DictWriter(
        fh,
        fieldnames=columns,
        extrasaction="raise" if strict else "ignore",
        lineterminator=LINE_TERMINATOR,
    )


def _replace_atomically(path: Path, write_body: Callable[[TextIO], None]) -> None:
    """Write to a temp file next to ``path``, then ``os.replace`` it into place.

    ``os.replace`` is the only step that can touch ``path`` itself, so a script
    killed mid-write, an OOM, or a full disk leaves the committed file exactly as
    it was — never truncated. The temp file is cleaned up on any failure so a
    crash does not leave debris behind either.
    """
    tmp = path.with_name(f"{path.name}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8", newline="") as out:
            write_body(out)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def append_rows(
    path: Path, rows: list[dict], columns: list[str], *, strict: bool = False
) -> None:
    """Atomically append ``rows`` to the CSV at ``path``.

    - Writes a header row when the target does not exist or is empty.
    - Ignores dict keys not in ``columns`` (csv.DictWriter extrasaction="ignore"),
      unless ``strict=True`` raises on unexpected keys instead.
    - No-op when ``rows`` is empty (never creates a header-only file).
    """
    if not rows:
        return

    path = Path(path)
    has_content = path.exists() and path.stat().st_size > 0

    def write_body(out: TextIO) -> None:
        if has_content:
            # Preserve existing bytes verbatim (header + prior rows).
            with open(path, encoding="utf-8", newline="") as src:
                out.write(src.read())
        writer = dict_writer(out, columns, strict=strict)
        if not has_content:
            writer.writeheader()
        writer.writerows(rows)

    _replace_atomically(path, write_body)


def write_rows(path: Path, rows: list[dict], columns: list[str], *, strict: bool = False) -> None:
    """Atomically REPLACE the CSV at ``path`` with ``rows``.

    The whole-file counterpart to ``append_rows``, and atomic for the same
    reason: a script that opens a committed seed in "w" mode has already
    truncated it by the time anything goes wrong, and this repo has lost a seed
    that way before.
    """
    path = Path(path)

    def write_body(out: TextIO) -> None:
        writer = dict_writer(out, columns, strict=strict)
        writer.writeheader()
        writer.writerows(rows)

    _replace_atomically(path, write_body)
