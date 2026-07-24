"""Cosine similarity search and embedding export."""

import numpy as np


def _clean(val: object) -> object:
    """Convert NaN/NaT to None for JSON serialization."""
    if val is None:
        return None
    if isinstance(val, float) and (val != val or val in (float("inf"), float("-inf"))):
        return None
    return val


def build_embeddings_export(
    matrix: np.ndarray,
    ids: list[int],
    films: list[dict],
) -> dict:
    """Build the JSON-serializable export for R2.

    Vectors are sparse (mean ~16 non-zero of ~450 dims): each is a
    [indices, values] pair, values rounded to 4 decimals. Rows are already
    L2-normalized by the encoder, so client-side cosine reduces to a dot
    product over the non-zero entries.
    """
    vectors: dict[int, list[list]] = {}
    for i, tid in enumerate(ids):
        row = matrix[i]
        nz = np.nonzero(row)[0]
        vectors[tid] = [
            [int(j) for j in nz],
            [round(float(row[j]), 4) for j in nz],
        ]
    metadata = {}
    for f in films:
        metadata[f["tmdb_id"]] = {
            "title": _clean(f.get("title")) or "",
            "year": _clean(f.get("year") or f.get("release_year")),
            "genres": _clean(f.get("genres")) or "",
            "keywords": _clean(f.get("keywords")) or "",
            "director": _clean(f.get("director")) or "",
            "actors": _clean(f.get("actors")) or "",
            "runtime": _clean(f.get("runtime") or f.get("runtime_min")),
            "rated": _clean(f.get("rated")) or "",
            "language": _clean(f.get("language") or f.get("original_language")) or "",
            "production_countries": _clean(f.get("production_countries")) or "",
            "metascore": _clean(f.get("metascore")),
            "rt_rating": _clean(f.get("rt_rating")),
            "imdb_rating": _clean(f.get("imdb_rating")),
            "imdb_id": _clean(f.get("imdb_id")) or "",
        }
    return {"dims": int(matrix.shape[1]), "vectors": vectors, "metadata": metadata}
