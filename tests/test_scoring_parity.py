"""Verify Python and TypeScript taste vectors produce the same output.

The TypeScript implementation in web/src/lib/recommend.ts and the Python
implementation in recommend/scoring.py must agree. This test uses a shared
fixture (five films, two ratings) and compares the Python output against
expected values verified in web/src/lib/__tests__/recommend.test.ts.
"""

from recommend.scoring import taste_vector

DIMS = 4
VECTORS = {
    1: ([0], [1.0]),
    2: ([0, 1], [0.9, 0.1]),
    3: ([2], [1.0]),
    4: ([0, 1], [0.8, 0.2]),
}
WATCHES = [(1, 100.0), (3, 20.0)]


def test_taste_vector_matches_typescript():
    """Same fixture as the TS tasteVector test 'points toward highly rated
    films' and 'points away from disliked films'."""
    taste = taste_vector(DIMS, VECTORS, WATCHES)
    assert taste is not None

    assert abs(taste[0] - 1.0) < 1e-6
    assert taste[1] == 0.0
    assert taste[2] < 0
    assert taste[3] == 0.0

    expected_weight_film1 = (100.0 - 60) / (100 - 60)
    expected_weight_film3 = (20.0 - 60) / (100 - 60)
    assert abs(taste[0] - expected_weight_film1 * 1.0) < 1e-6
    assert abs(taste[2] - expected_weight_film3 * 1.0) < 1e-6
