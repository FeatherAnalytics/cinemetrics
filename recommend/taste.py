"""Similarity-weighted k-NN taste predictor (offline evaluation tool).

Predicts a personal rating for a film as the cosine-similarity-weighted average
of the ratings of its nearest rated neighbours in embedding space. This leverages
the recommendation engine's similarity signal rather than a linear model on raw
features (a Ridge predictor was tried and removed for not beating the mean).

FINDING (2026-07, 675 rated films, 5-fold CV): content features do not predict
this library's ratings. The k-NN model scores R^2 0.018 (MAE 10.07) — barely
above the predict-the-mean baseline and far below a critics-only linear
regression (R^2 0.203, MAE 8.98). Critic consensus is the only reliable
predictor, so no taste-prediction panel is shipped in the dashboard.

This module is retained as an evaluation tool: re-run `scripts/eval_taste.py`
as the library grows to check whether content signal has emerged. All estimates
are cross-validated against the predict-the-mean baseline before being trusted.
"""

import numpy as np
from sklearn.model_selection import KFold

MIN_RATED = 30
DEFAULT_KS = (5, 10, 15, 20, 30)
_EPS = 1e-12


def _cosine_sims(target: np.ndarray, neighbors: np.ndarray) -> np.ndarray:
    tn = np.linalg.norm(target)
    nn = np.linalg.norm(neighbors, axis=1)
    denom = nn * tn
    dots = neighbors @ target
    return np.where(denom > _EPS, dots / (denom + _EPS), 0.0)


def knn_predict(
    target: np.ndarray,
    neighbors: np.ndarray,
    ratings: np.ndarray,
    k: int,
) -> float:
    """Cosine-similarity-weighted mean rating over the k nearest neighbours.

    Neighbours with non-positive similarity carry zero weight. If no neighbour
    has positive similarity, fall back to the unweighted mean of the k nearest.
    """
    sims = _cosine_sims(target, neighbors)
    k = min(k, len(ratings))
    top = np.argsort(sims)[::-1][:k]
    w = np.clip(sims[top], 0.0, None)
    if w.sum() <= _EPS:
        return float(ratings[top].mean())
    return float((w * ratings[top]).sum() / w.sum())


def cross_validate_knn(
    vectors: np.ndarray,
    ratings: np.ndarray,
    k: int,
    n_splits: int = 5,
    seed: int = 42,
) -> dict:
    """5-fold CV of the k-NN predictor against a per-fold mean baseline.

    Returns out-of-fold MAE, the baseline MAE (predict the training mean),
    out-of-fold R2, and n/k for reporting.
    """
    vectors = np.asarray(vectors, dtype=float)
    ratings = np.asarray(ratings, dtype=float)
    n = len(ratings)
    preds = np.empty(n)
    baseline = np.empty(n)

    kf = KFold(n_splits=min(n_splits, n), shuffle=True, random_state=seed)
    for train_idx, test_idx in kf.split(vectors):
        train_mean = ratings[train_idx].mean()
        for t in test_idx:
            preds[t] = knn_predict(
                vectors[t], vectors[train_idx], ratings[train_idx], k
            )
            baseline[t] = train_mean

    mae = float(np.mean(np.abs(preds - ratings)))
    baseline_mae = float(np.mean(np.abs(baseline - ratings)))
    ss_res = float(np.sum((ratings - preds) ** 2))
    ss_tot = float(np.sum((ratings - ratings.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > _EPS else 0.0

    return {"mae": mae, "baseline_mae": baseline_mae, "r2": r2, "n": n, "k": k}


def select_k(
    vectors: np.ndarray,
    ratings: np.ndarray,
    ks: tuple[int, ...] = DEFAULT_KS,
    n_splits: int = 5,
    seed: int = 42,
) -> tuple[int, dict[int, float]]:
    """Pick k with the lowest CV MAE. Returns (best_k, {k: mae})."""
    scores = {
        k: cross_validate_knn(vectors, ratings, k, n_splits, seed)["mae"] for k in ks
    }
    best_k = min(scores, key=scores.get)
    return best_k, scores


def predict_all(
    vectors: np.ndarray,
    ratings: np.ndarray,
    ids: list[int],
    k: int,
) -> dict[int, float]:
    """Leave-one-out predictions for every rated film (each excludes itself)."""
    vectors = np.asarray(vectors, dtype=float)
    ratings = np.asarray(ratings, dtype=float)
    out: dict[int, float] = {}
    n = len(ids)
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        out[ids[i]] = knn_predict(vectors[i], vectors[mask], ratings[mask], k)
    return out
