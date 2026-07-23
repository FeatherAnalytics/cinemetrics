"""Evaluate whether content features predict personal ratings.

Compares three predictors on rated films via 5-fold cross-validation:
  - baseline: predict the mean rating
  - critics-only OLS: linear regression on Metacritic / RT / IMDB
  - k-NN embedding: similarity-weighted neighbours in recommendation-engine space

As of 2026-07 the k-NN model does not meaningfully beat the mean and is far
worse than critics-only, so no taste panel is shipped. Re-run as the library
grows to see whether content signal emerges.

Usage: uv run python scripts/eval_taste.py
"""

import json

import duckdb
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_predict

from recommend import ROOT
from recommend.taste import DEFAULT_KS, cross_validate_knn, select_k

DB = ROOT / "data" / "movies.duckdb"
EMBEDDINGS = ROOT / "data" / "ml" / "embeddings.json"


def _load() -> tuple[list[int], np.ndarray, np.ndarray, np.ndarray]:
    emb = json.loads(EMBEDDINGS.read_text())
    vectors, meta = emb["vectors"], emb["metadata"]

    con = duckdb.connect(str(DB), read_only=True)
    rows = con.execute(
        "select tmdb_id, max(rating_100) as rating from fct_watches "
        "where rating_100 is not null group by tmdb_id"
    ).fetchall()
    con.close()

    ids, X, y, crit = [], [], [], []
    for tid, rating in rows:
        tid = int(tid)
        vec, m = vectors.get(str(tid)), meta.get(str(tid))
        if vec is None or m is None:
            continue
        ms, rt, ir = m.get("metascore"), m.get("rt_rating"), m.get("imdb_rating")
        if ms is None or rt is None or ir is None:
            continue
        ids.append(tid)
        X.append(vec)
        y.append(float(rating))
        crit.append([ms, rt, ir * 10.0])

    return ids, np.array(X, float), np.array(y, float), np.array(crit, float)


def _r2(y: np.ndarray, preds: np.ndarray) -> float:
    return 1.0 - np.sum((y - preds) ** 2) / np.sum((y - y.mean()) ** 2)


def main() -> None:
    ids, X, y, crit = _load()
    print(f"rated films with critic scores + vectors: {len(ids)}")
    print(f"baseline (predict mean)   MAE={np.mean(np.abs(y - y.mean())):5.2f}   R^2= 0.000")

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    crit_preds = cross_val_predict(LinearRegression(), crit, y, cv=kf)
    print(f"critics-only OLS          MAE={np.mean(np.abs(crit_preds - y)):5.2f}   "
          f"R^2={_r2(y, crit_preds):6.3f}")

    best_k, _ = select_k(X, y, ks=DEFAULT_KS, n_splits=5, seed=42)
    res = cross_validate_knn(X, y, k=best_k, n_splits=5, seed=42)
    print(f"k-NN embedding (k={best_k:>2})      MAE={res['mae']:5.2f}   R^2={res['r2']:6.3f}")

    crit_mae = float(np.mean(np.abs(crit_preds - y)))
    verdict = "beats" if res["mae"] < crit_mae else "loses to"
    print(f"\nk-NN {verdict} critics-only. "
          f"{'Consider shipping.' if verdict == 'beats' else 'Do not ship a taste panel.'}")


if __name__ == "__main__":
    main()
