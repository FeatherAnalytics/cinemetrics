"""eval_recs on a five-film fixture pool returns rank 1 for a held-out film
identical to the taste vector."""

from recommend.scoring import score_candidates, taste_vector


def test_identical_film_ranks_first():
    dims = 4
    vectors = {
        1: ([0], [1.0]),
        2: ([0, 1], [0.9, 0.1]),
        3: ([2], [1.0]),
        4: ([1, 3], [0.5, 0.5]),
        5: ([3], [1.0]),
    }
    rated = {1: 100.0, 2: 80.0}

    rest = [(t, r) for t, r in rated.items() if t != 1]
    tv = taste_vector(dims, vectors, rest)
    assert tv is not None

    metadata: dict[int, dict] = {i: {} for i in range(1, 6)}
    scored = score_candidates(tv, vectors, metadata, 0.0, {2})

    scored.sort(key=lambda x: -x[1])
    rank_map = {tid: i + 1 for i, (tid, _) in enumerate(scored)}
    assert rank_map[1] == 1
