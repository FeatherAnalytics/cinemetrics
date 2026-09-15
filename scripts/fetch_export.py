"""Download the Letterboxd data export zip to data/raw/letterboxd_export/.

Usage:
    uv run python scripts/fetch_export.py [--out DIR]

Needs LETTERBOXD_COOKIE and LETTERBOXD_USER_AGENT in .env (see .env.example).
The download lands under data/raw/, which is gitignored — the export contains
reviews, comments, and profile data that must never reach a public repo.
"""

import argparse
import io
import os
import sys
import zipfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.letterboxd_export import ExportError, fetch_export  # noqa: E402

DEFAULT_OUT = ROOT / "data" / "raw" / "letterboxd_export"


def main() -> int:
    parser = argparse.ArgumentParser(description="Download the Letterboxd data export.")
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_OUT, help=f"output dir (default: {DEFAULT_OUT})"
    )
    args = parser.parse_args()

    cookie = os.environ.get("LETTERBOXD_COOKIE", "")
    user_agent = os.environ.get("LETTERBOXD_USER_AGENT", "")

    print("Downloading export from letterboxd.com ...")
    try:
        payload, filename = fetch_export(cookie, user_agent)
    except ExportError as err:
        print(f"FAILED: {err}", file=sys.stderr)
        return 1

    if not zipfile.is_zipfile(io.BytesIO(payload)):
        print("FAILED: response was not a valid zip archive", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    dest = args.out / filename
    dest.write_bytes(payload)

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        names = zf.namelist()

    print(f"  wrote {dest}  ({len(payload):,} bytes, {len(names)} files)")
    for name in sorted(names)[:12]:
        print(f"    {name}")
    if len(names) > 12:
        print(f"    ... and {len(names) - 12} more")

    return 0


if __name__ == "__main__":
    sys.exit(main())
