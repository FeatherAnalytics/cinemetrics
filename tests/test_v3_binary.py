"""Round-trip test for the v3 binary embedding format."""

import struct

import numpy as np

from recommend.model import build_v3_binary


def test_v3_binary_roundtrip():
    matrix = np.zeros((3, 10))
    matrix[0, [1, 5]] = [0.5, 0.3]
    matrix[1, [0, 3, 7]] = [0.2, 0.8, 0.1]
    matrix[2, [9]] = [1.0]
    ids = [100, 200, 300]

    data = build_v3_binary(matrix, ids)

    offset = 0
    for _i, (expected_tid, expected_row) in enumerate(zip(ids, matrix, strict=True)):
        tid, nnz = struct.unpack_from("<IH", data, offset)
        offset += 6
        assert tid == expected_tid
        nz = np.nonzero(expected_row)[0]
        assert nnz == len(nz)
        indices = struct.unpack_from(f"<{nnz}H", data, offset)
        offset += nnz * 2
        values = np.frombuffer(data, dtype=np.float16, count=nnz, offset=offset)
        offset += nnz * 2
        assert list(indices) == list(nz)
        np.testing.assert_allclose(values, expected_row[nz], atol=1e-2)

    assert offset == len(data)
