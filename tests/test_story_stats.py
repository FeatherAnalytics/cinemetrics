"""The story's Kruskal-Wallis tests distinguish signal from noise."""

from scipy.stats import kruskal


def test_similar_groups_produce_high_p():
    groups = [[74, 75, 76, 75], [75, 74, 76, 75], [76, 75, 74, 75]]
    _, p = kruskal(*groups)
    assert p > 0.9


def test_shifted_group_produces_low_p():
    base = [70, 72, 74, 71, 73] * 10
    shifted = [100, 102, 104, 101, 103] * 10
    _, p = kruskal(base, shifted)
    assert p < 0.01
