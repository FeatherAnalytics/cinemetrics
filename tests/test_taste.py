"""Tests for the similarity-weighted k-NN taste predictor."""

import numpy as np
import pytest

from recommend.taste import (
    cross_validate_knn,
    knn_predict,
    select_k,
)


class TestKnnPredict:
    def test_weights_by_cosine_similarity(self):
        # Two neighbors identical to target (sim 1), one orthogonal (sim 0).
        target = np.array([1.0, 0.0])
        neighbors = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 0.0]])
        ratings = np.array([90.0, 10.0, 80.0])
        # Orthogonal neighbor carries zero weight -> mean of the two aligned.
        pred = knn_predict(target, neighbors, ratings, k=3)
        assert abs(pred - 85.0) < 1e-6

    def test_respects_k(self):
        target = np.array([1.0, 0.0])
        neighbors = np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0]])
        ratings = np.array([100.0, 50.0, 0.0])
        # k=1 -> only the single nearest neighbor.
        pred = knn_predict(target, neighbors, ratings, k=1)
        assert abs(pred - 100.0) < 1e-6

    def test_falls_back_to_mean_when_no_positive_similarity(self):
        target = np.array([1.0, 0.0])
        neighbors = np.array([[-1.0, 0.0], [0.0, -1.0]])
        ratings = np.array([40.0, 60.0])
        pred = knn_predict(target, neighbors, ratings, k=2)
        assert abs(pred - 50.0) < 1e-6


class TestCrossValidate:
    def test_beats_baseline_when_rating_depends_on_vector(self):
        rng = np.random.default_rng(0)
        n = 120
        X = rng.normal(size=(n, 4))
        # Rating is a smooth function of the first dimension -> neighbors informative.
        ratings = 50.0 + 40.0 * np.tanh(X[:, 0])
        res = cross_validate_knn(X, ratings, k=10, n_splits=5, seed=42)
        assert res["mae"] < res["baseline_mae"]
        assert res["r2"] > 0.2

    def test_no_better_than_baseline_when_rating_is_noise(self):
        rng = np.random.default_rng(1)
        n = 100
        X = rng.normal(size=(n, 4))
        ratings = rng.normal(60.0, 10.0, size=n)  # independent of X
        res = cross_validate_knn(X, ratings, k=10, n_splits=5, seed=42)
        # kNN cannot beat predicting the mean on pure noise.
        assert res["mae"] >= res["baseline_mae"] * 0.9

    def test_reports_expected_keys(self):
        rng = np.random.default_rng(2)
        X = rng.normal(size=(60, 3))
        ratings = rng.normal(60.0, 8.0, size=60)
        res = cross_validate_knn(X, ratings, k=5, n_splits=5, seed=42)
        assert set(res) >= {"mae", "baseline_mae", "r2", "n", "k"}
        assert res["n"] == 60
        assert res["k"] == 5

    def test_raises_on_fewer_than_two_samples(self):
        with pytest.raises(ValueError):
            cross_validate_knn(np.zeros((1, 3)), np.array([50.0]), k=1)


class TestSelectK:
    def test_returns_candidate_with_lowest_cv_mae(self):
        rng = np.random.default_rng(3)
        n = 150
        X = rng.normal(size=(n, 4))
        ratings = 50.0 + 40.0 * np.tanh(X[:, 0])
        best_k, scores = select_k(X, ratings, ks=(5, 10, 20), n_splits=5, seed=42)
        assert best_k in (5, 10, 20)
        assert scores[best_k] == min(scores.values())
