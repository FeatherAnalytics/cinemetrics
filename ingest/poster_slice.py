"""Sample a poster image down to a thin vertical colour column.

The landing-page barcode draws one stripe per watch. Doing that with poster
images would ship megabytes to every visitor; a 20-stop colour column is 120
characters per film and draws the same picture.

An AVERAGE colour per poster does not work — averaging a whole poster always
lands in brown, so 676 films come out as 676 shades of mud. Sampling a column
keeps the poster's own vertical contrast, which is what makes the strip
readable.
"""

import csv
import io
from pathlib import Path

from PIL import Image

from ingest.csvio import write_rows
from ingest.http import get_bytes

SLICE_STOPS = 20
POSTER_CDN = "https://image.tmdb.org/t/p/w92"

# The column order of transform/seeds/poster_slices.csv, owned here because the
# seed has three writers: scripts/update.py adds a row per newly enriched film,
# scripts/backfill_poster_slices.py fills in whatever is missing, and
# scripts/reslice_overridden_posters.py re-samples a curated override. A private
# copy in each is the arrangement that let poster_path go stale in the
# enrichment seeds for months, since dict_writer silently drops a key no column
# list mentions. All three go through write_slice_seed below for the same
# reason.
SLICE_CSV_COLUMNS = ["tmdb_id", "slice"]

Stop = tuple[int, int, int]


def sample_slice(image_bytes: bytes) -> list[Stop]:
    """Reduce a poster to SLICE_STOPS RGB stops, top to bottom."""
    im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    col = im.resize((1, SLICE_STOPS), Image.LANCZOS)
    return [col.getpixel((0, y)) for y in range(SLICE_STOPS)]


def encode_slice(stops: list[Stop]) -> str:
    """Pack stops into one hex string, six characters each, no separators."""
    if len(stops) != SLICE_STOPS:
        raise ValueError(f"expected {SLICE_STOPS} stops, got {len(stops)}")
    return "".join(f"{r:02x}{g:02x}{b:02x}" for r, g, b in stops)


def slice_for_poster(poster_path: str) -> str:
    """Fetch a poster by its TMDB path and return its encoded slice.

    Returns "" when the path is empty or the fetch fails, so callers can treat
    "no poster" and "no slice" as the same absent value.
    """
    if not poster_path:
        return ""
    raw = get_bytes(f"{POSTER_CDN}{poster_path}")
    if not raw:
        return ""
    return encode_slice(sample_slice(raw))


def read_slice_seed(path: Path) -> dict[str, str]:
    """The slice seed as {tmdb_id: slice}, empty when the file does not exist."""
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as fh:
        return {r["tmdb_id"]: r["slice"] for r in csv.DictReader(fh)}


def write_slice_seed(path: Path, slices: dict[str, str]) -> None:
    """Atomically rewrite the seed in numeric tmdb_id order.

    Numeric order is an INVARIANT every writer holds, not a tidy-up one of them
    performs at the end. It used to be the latter, and the difference was
    expensive: scripts/update.py appended a new film's slice to the END of the
    file, and because tmdb_ids are not monotonic with watch date the row almost
    always landed out of order. The next backfill_poster_slices.py run then
    re-sorted all 676 rows, so every nightly commit that added one film carried a
    whole-file reorder, and the workflow's byte-identical check reported a repair
    on a night when nothing had been repaired.

    Holding the order on every write keeps each commit to the rows that actually
    changed, which is the property docs/ARCHITECTURE.md claims for the seeds in
    git history. Rewriting rather than appending also makes a duplicate tmdb_id
    unrepresentable, which the seed's unique test previously had to catch.
    """
    write_rows(
        path,
        [{"tmdb_id": t, "slice": slices[t]} for t in sorted(slices, key=int)],
        SLICE_CSV_COLUMNS,
        strict=True,
    )
