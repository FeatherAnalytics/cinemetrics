"""Cosine similarity search and rating prediction."""

import numpy as np
from sklearn.linear_model import Ridge


class RatingPredictor:
    """Ridge regression: embedding → predicted rating (0-100)."""

    def __init__(self) -> None:
        self._model = Ridge(alpha=1.0)
        self._fitted = False

    def fit(
        self,
        matrix: np.ndarray,
        ids: list[int],
        ratings: dict[int, float],
    ) -> None:
        mask = [i for i, tid in enumerate(ids) if tid in ratings]
        if not mask:
            raise ValueError("No rated films found in matrix")
        X = matrix[mask]
        y = np.array([ratings[ids[i]] for i in mask])
        self._model.fit(X, y)
        self._fitted = True

    def predict(self, matrix: np.ndarray) -> list[float]:
        if not self._fitted:
            raise RuntimeError("Call fit first")
        raw = self._model.predict(matrix)
        return [float(np.clip(p, 0, 100)) for p in raw]


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
