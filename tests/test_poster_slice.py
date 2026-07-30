"""Cover the poster slice encoder."""

import io

import pytest
from PIL import Image

from ingest.poster_slice import SLICE_STOPS, encode_slice, sample_slice


def _solid(color: tuple[int, int, int], size: tuple[int, int] = (92, 138)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def test_sample_slice_returns_one_stop_per_row():
    assert len(sample_slice(_solid((255, 0, 0)))) == SLICE_STOPS


def test_sample_slice_of_a_solid_image_is_that_colour():
    # JPEG is lossy, so allow a small channel tolerance.
    for r, g, b in sample_slice(_solid((255, 0, 0))):
        assert r > 240 and g < 15 and b < 15


def test_encode_slice_is_six_hex_chars_per_stop():
    encoded = encode_slice([(255, 0, 0)] * SLICE_STOPS)
    assert encoded == "ff0000" * SLICE_STOPS
    assert len(encoded) == SLICE_STOPS * 6


def test_encode_slice_rejects_the_wrong_number_of_stops():
    with pytest.raises(ValueError):
        encode_slice([(1, 2, 3)])


def test_sample_slice_top_and_bottom_differ_on_a_split_image():
    im = Image.new("RGB", (92, 138), (255, 255, 255))
    for y in range(69, 138):
        for x in range(92):
            im.putpixel((x, y), (0, 0, 0))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=95)
    stops = sample_slice(buf.getvalue())
    assert stops[0][0] > 200      # top half is light
    assert stops[-1][0] < 60      # bottom half is dark


def test_slice_for_poster_is_empty_when_there_is_no_path():
    # "no poster" and "no slice" must be the same absent value downstream.
    from ingest.poster_slice import slice_for_poster

    assert slice_for_poster("") == ""


def test_slice_columns_match_the_seed_header():
    """SLICE_CSV_COLUMNS must equal the header of the file its writers write.

    poster_slices.csv has two writers, and the only check that survives one of
    them drifting is the bytes on disk.
    """
    import csv
    from pathlib import Path

    from ingest.poster_slice import SLICE_CSV_COLUMNS

    seed = (
        Path(__file__).resolve().parents[1] / "transform" / "seeds" / "poster_slices.csv"
    )
    with open(seed, encoding="utf-8", newline="") as fh:
        header = next(csv.reader(fh))
    assert SLICE_CSV_COLUMNS == header
