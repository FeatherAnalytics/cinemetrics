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
    """Build the JSON-serializable export for R2."""
    vectors = {tid: matrix[i].tolist() for i, tid in enumerate(ids)}
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
    return {"vectors": vectors, "metadata": metadata}
