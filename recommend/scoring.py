"""Scoring functions shared between eval_recs.py and the TypeScript client.

The TS client in web/src/lib/recommend.ts implements the same math. A test
in tests/test_scoring_parity.py pins them equal on a shared fixture.
"""

import numpy as np

NEUTRAL_RATING = 60


def taste_vector(
    dims: int,
    vectors: dict[int, tuple[list[int], list[float]]],
    watches: list[tuple[int, float]],
) -> np.ndarray | None:
    """Rating-weighted mean of watched films' embeddings.

    ``vectors`` maps tmdb_id to (indices, values) sparse pairs.
    ``watches`` is a list of (tmdb_id, rating) pairs.
    """
    sums: dict[int, tuple[float, int]] = {}
    for tid, rating in watches:
        if tid not in vectors:
            continue
        total, n = sums.get(tid, (0.0, 0))
        sums[tid] = (total + rating, n + 1)
    if not sums:
        return None

    taste = np.zeros(dims)
    for tid, (total, n) in sums.items():
        avg = total / n
        weight = (avg - NEUTRAL_RATING) / (100 - NEUTRAL_RATING)
        idx, vals = vectors[tid]
        for i, v in zip(idx, vals, strict=True):
            taste[i] += weight * v
    return taste if np.any(taste != 0) else None


def critic_prior(meta: dict, pool_mean: float) -> float:
    scores: list[float] = []
    ms = meta.get("metascore")
    if ms is not None:
        scores.append(float(ms) / 100)
    rt = meta.get("rt_rating")
    if rt is not None:
        scores.append(float(rt) / 100)
    imdb = meta.get("imdb_rating")
    if imdb is not None:
        scores.append(float(imdb) / 10)
    return sum(scores) / len(scores) if scores else pool_mean


def score_candidates(
    taste: np.ndarray,
    vectors: dict[int, tuple[list[int], list[float]]],
    metadata: dict[int, dict],
    lambda_: float,
    exclude: set[int],
) -> list[tuple[int, float]]:
    """Score candidates by cosine(taste, film) + λ·prior(film)."""
    taste_norm = float(np.linalg.norm(taste))
    if taste_norm == 0:
        return []

    pool_priors = [critic_prior(m, float("nan")) for m in metadata.values()]
    valid = [p for p in pool_priors if p == p]
    pool_mean = sum(valid) / len(valid) if valid else 0.5

    scored: list[tuple[int, float]] = []
    for tid, (idx, vals) in vectors.items():
        if tid in exclude:
            continue
        dot = sum(taste[i] * v for i, v in zip(idx, vals, strict=True))
        film_norm = float(np.sqrt(sum(v * v for v in vals)))
        cos = dot / (taste_norm * film_norm) if film_norm > 0 else 0.0
        cos = max(0.0, cos)
        prior = critic_prior(metadata.get(tid, {}), pool_mean) if lambda_ > 0 else 0.0
        scored.append((tid, cos + lambda_ * prior))
    return scored
