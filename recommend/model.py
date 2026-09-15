"""Cosine similarity search and embedding export."""

import numpy as np
import scipy.sparse as sp


def _clean(val: object) -> object:
    """Convert NaN/NaT to None for JSON serialization."""
    if val is None:
        return None
    if isinstance(val, float) and (val != val or val in (float("inf"), float("-inf"))):
        return None
    return val


def build_embeddings_export(
    matrix: sp.csr_matrix | np.ndarray,
    ids: list[int],
    films: list[dict],
) -> dict:
    """Build the JSON-serializable export for R2.

    Vectors are sparse (mean ~16 non-zero of ~450 dims): each is a
    [indices, values] pair, values rounded to 4 decimals. Rows are already
    L2-normalized by the encoder, so client-side cosine reduces to a dot
    product over the non-zero entries.
    """
    is_sparse = sp.issparse(matrix)
    vectors: dict[int, list[list]] = {}
    for i, tid in enumerate(ids):
        if is_sparse:
            csr_row = matrix.getrow(i)  # type: ignore[union-attr]
            order = np.argsort(csr_row.indices)
            nz = csr_row.indices[order]
            vals = csr_row.data[order]
        else:
            row = matrix[i]
            nz = np.nonzero(row)[0]
            vals = row[nz]
        rounded = [(int(j), round(float(v), 4)) for j, v in zip(nz, vals, strict=True)]
        rounded = [(j, v) for j, v in rounded if v != 0.0]
        vectors[tid] = [
            [j for j, _ in rounded],
            [v for _, v in rounded],
        ]
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
            # TMDB image path, e.g. "/abc123.jpg", not a URL: the CDN host and
            # size segment belong to the card that renders it. None where TMDB
            # serves no art, so the card can lay out text-only rather than
            # requesting an empty path.
            "poster": _clean(f.get("poster_path")) or None,
        }
    return {"dims": int(matrix.shape[1]), "vectors": vectors, "metadata": metadata}  # type: ignore


def build_v3_binary(
    matrix: sp.csr_matrix | np.ndarray,
    ids: list[int],
) -> bytes:
    """Pack sparse vectors into a compact binary format.

    For each film: uint32 tmdb_id, uint16 nnz, then nnz x uint16 index and
    nnz x float16 value, all little-endian.
    """
    import struct

    is_sparse = sp.issparse(matrix)
    parts: list[bytes] = []
    for i, tid in enumerate(ids):
        if is_sparse:
            row = matrix.getrow(i)  # type: ignore[union-attr]
            order = np.argsort(row.indices)
            indices = row.indices[order]
            values = row.data[order]
        else:
            dense = matrix[i]
            nz = np.nonzero(dense)[0]
            indices = nz
            values = dense[nz]
        mask = values != 0
        indices = indices[mask]
        values = values[mask]
        nnz = len(indices)
        parts.append(struct.pack("<IH", tid, nnz))
        parts.append(struct.pack(f"<{nnz}H", *indices.astype(np.uint16)))
        parts.append(np.array(values, dtype=np.float16).tobytes())
    return b"".join(parts)


def build_v3_metadata(films: list[dict]) -> dict[int, dict]:
    """Metadata per film for v3, without keywords and actors."""
    metadata: dict[int, dict] = {}
    for f in films:
        metadata[f["tmdb_id"]] = {
            "title": _clean(f.get("title")) or "",
            "year": _clean(f.get("year") or f.get("release_year")),
            "genres": _clean(f.get("genres")) or "",
            "runtime": _clean(f.get("runtime") or f.get("runtime_min")),
            "rated": _clean(f.get("rated")) or "",
            "language": _clean(f.get("language") or f.get("original_language")) or "",
            "production_countries": _clean(f.get("production_countries")) or "",
            "metascore": _clean(f.get("metascore")),
            "rt_rating": _clean(f.get("rt_rating")),
            "imdb_rating": _clean(f.get("imdb_rating")),
            "imdb_id": _clean(f.get("imdb_id")) or "",
            "poster": _clean(f.get("poster_path")) or None,
        }
    return metadata
