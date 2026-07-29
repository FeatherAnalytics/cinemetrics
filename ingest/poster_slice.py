"""Sample a poster image down to a thin vertical colour column.

The landing-page barcode draws one stripe per watch. Doing that with poster
images would ship megabytes to every visitor; a 20-stop colour column is 120
characters per film and draws the same picture.

An AVERAGE colour per poster does not work — averaging a whole poster always
lands in brown, so 676 films come out as 676 shades of mud. Sampling a column
keeps the poster's own vertical contrast, which is what makes the strip
readable.
"""

import io

from PIL import Image

from ingest.http import get_bytes

SLICE_STOPS = 20
POSTER_CDN = "https://image.tmdb.org/t/p/w92"

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
