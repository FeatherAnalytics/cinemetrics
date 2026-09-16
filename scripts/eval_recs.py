"""Leave-one-out evaluation of the recommendation engine.

For each film rated 80+ (liked): remove it, build the taste vector from the
rest, rank the held-out film among the candidate pool plus itself. The same
for films rated 50- (disliked), where a good ranker ranks them low.

Reports median rank, hit@10, hit@100, and MRR for:
  - taste cosine (λ=0)
  - balanced (λ=0.5)
  - random baseline
  - IMDb-rating-descending baseline
"""

import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from recommend.scoring import score_candidates, taste_vector

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = ROOT / "data" / "ml"
OUT = ROOT / "web" / "public" / "data" / "recs-eval.json"


def _load_vectors(path: Path) -> tuple[int, dict[int, tuple[list[int], list[float]]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    dims = data["dims"]
    vectors: dict[int, tuple[list[int], list[float]]] = {}
    for tid_str, (idx, vals) in data["vectors"].items():
        vectors[int(tid_str)] = (idx, vals)
    return dims, vectors


def _load_metadata(path: Path) -> dict[int, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    meta: dict[int, dict] = {}
    for tid_str, m in data.items():
        meta[int(tid_str)] = m
    return meta


def _rank(tid: int, scored: list[tuple[int, float]]) -> int:
    scored.sort(key=lambda x: -x[1])
    for i, (sid, _) in enumerate(scored):
        if sid == tid:
            return i + 1
    return len(scored) + 1


def _eval_ranker(
    rated: dict[int, float],
    threshold: float,
    above: bool,
    dims: int,
    vectors: dict[int, tuple[list[int], list[float]]],
    metadata: dict[int, dict],
    lambda_: float,
) -> dict:
    films = [
        tid for tid, r in rated.items()
        if tid in vectors and (r >= threshold if above else r <= threshold)
    ]
    if not films:
        return {"n": 0, "median_rank": None, "hit_10": None, "hit_100": None, "mrr": None}

    ranks: list[int] = []
    for held_out in films:
        rest = [(t, r) for t, r in rated.items() if t != held_out]
        tv = taste_vector(dims, vectors, rest)
        if tv is None:
            continue
        scored = score_candidates(tv, vectors, metadata, lambda_, set(rated.keys()) - {held_out})
        if held_out not in dict(scored):
            scored.append((held_out, 0.0))
        ranks.append(_rank(held_out, scored))

    if not ranks:
        return {"n": 0, "median_rank": None, "hit_10": None, "hit_100": None, "mrr": None}

    n = len(ranks)
    return {
        "n": n,
        "median_rank": int(np.median(ranks)),
        "hit_10": round(sum(1 for r in ranks if r <= 10) / n, 3),
        "hit_100": round(sum(1 for r in ranks if r <= 100) / n, 3),
        "mrr": round(sum(1 / r for r in ranks) / n, 4),
    }


def _eval_random(
    rated: dict[int, float],
    threshold: float,
    above: bool,
    pool_size: int,
) -> dict:
    films = [tid for tid, r in rated.items() if (r >= threshold if above else r <= threshold)]
    if not films:
        return {"n": 0, "median_rank": None, "hit_10": None, "hit_100": None, "mrr": None}
    n = len(films)
    random.seed(42)
    ranks = [random.randint(1, pool_size) for _ in films]  # noqa: S311
    return {
        "n": n,
        "median_rank": int(np.median(ranks)),
        "hit_10": round(sum(1 for r in ranks if r <= 10) / n, 3),
        "hit_100": round(sum(1 for r in ranks if r <= 100) / n, 3),
        "mrr": round(sum(1 / r for r in ranks) / n, 4),
    }


def _eval_imdb_desc(
    rated: dict[int, float],
    threshold: float,
    above: bool,
    vectors: dict[int, tuple[list[int], list[float]]],
    metadata: dict[int, dict],
) -> dict:
    films = [
        tid for tid, r in rated.items()
        if tid in vectors and (r >= threshold if above else r <= threshold)
    ]
    if not films:
        return {"n": 0, "median_rank": None, "hit_10": None, "hit_100": None, "mrr": None}

    ranks: list[int] = []
    for held_out in films:
        pool = [
            (tid, float(metadata.get(tid, {}).get("imdb_rating") or 0))
            for tid in vectors if tid not in rated or tid == held_out
        ]
        pool.sort(key=lambda x: -x[1])
        rank = next((i + 1 for i, (t, _) in enumerate(pool) if t == held_out), len(pool) + 1)
        ranks.append(rank)
    n = len(ranks)
    return {
        "n": n,
        "median_rank": int(np.median(ranks)),
        "hit_10": round(sum(1 for r in ranks if r <= 10) / n, 3),
        "hit_100": round(sum(1 for r in ranks if r <= 100) / n, 3),
        "mrr": round(sum(1 / r for r in ranks) / n, 4),
    }


def main() -> None:
    emb_path = ML_DIR / "embeddings-v2.json"
    if not emb_path.exists():
        print("no embeddings found — skipping eval")
        return

    dims, vectors = _load_vectors(emb_path)
    meta_path = ML_DIR / "metadata-v3.json"
    metadata = _load_metadata(meta_path) if meta_path.exists() else {}

    import duckdb
    db = ROOT / "data" / "movies.duckdb"
    con = duckdb.connect(str(db), read_only=True)
    rows = con.execute("""
        select tmdb_id, max(rating_100) as rating
        from marts.fct_watches
        where rating_100 is not null
        group by tmdb_id
    """).fetchdf().to_dict("records")
    rated = {int(r["tmdb_id"]): float(r["rating"]) for r in rows}

    vote_rows = con.execute("""
        select tmdb_id, tmdb_votes
        from staging.stg_candidate_enrichment
        where tmdb_votes is not null
    """).fetchdf().to_dict("records")
    votes_by_id = {int(r["tmdb_id"]): int(r["tmdb_votes"]) for r in vote_rows}
    con.close()

    pool_size = len(vectors) - len(rated)
    popular_ids = {tid for tid in vectors if votes_by_id.get(tid, 0) >= 1000 or tid in rated}
    popular_vectors = {tid: v for tid, v in vectors.items() if tid in popular_ids}
    popular_pool = len(popular_vectors) - len(rated)
    print(f"eval: {len(rated)} rated films, {pool_size} candidates in pool, "
          f"{popular_pool} with 1000+ votes")

    result: dict = {"pool_size": pool_size, "rated_count": len(rated)}

    for label, lam in [("cosine", 0.0), ("balanced", 0.5)]:
        print(f"  {label} (λ={lam}) liked...")
        result[f"{label}_liked"] = _eval_ranker(rated, 80, True, dims, vectors, metadata, lam)
        print(f"  {label} (λ={lam}) disliked...")
        result[f"{label}_disliked"] = _eval_ranker(rated, 50, False, dims, vectors, metadata, lam)

    print("  random baseline...")
    result["random_liked"] = _eval_random(rated, 80, True, pool_size)
    result["random_disliked"] = _eval_random(rated, 50, False, pool_size)

    print("  IMDb desc baseline...")
    result["imdb_liked"] = _eval_imdb_desc(rated, 80, True, vectors, metadata)
    result["imdb_disliked"] = _eval_imdb_desc(rated, 50, False, vectors, metadata)

    result["popular_pool_size"] = popular_pool
    for label, lam in [("cosine", 0.0), ("balanced", 0.5)]:
        print(f"  {label} (λ={lam}) popular liked...")
        result[f"popular_{label}_liked"] = _eval_ranker(
            rated, 80, True, dims, popular_vectors, metadata, lam,
        )
    result["popular_random_liked"] = _eval_random(rated, 80, True, popular_pool)
    result["popular_imdb_liked"] = _eval_imdb_desc(rated, 80, True, popular_vectors, metadata)

    result["date"] = datetime.now(UTC).strftime("%Y-%m-%d")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT}")

    for key in ["cosine_liked", "balanced_liked", "random_liked", "imdb_liked"]:
        d = result.get(key, {})
        mr, h100, mrr = d.get("median_rank"), d.get("hit_100"), d.get("mrr")
        print(f"  {key}: median={mr} hit@100={h100} MRR={mrr}")


if __name__ == "__main__":
    main()
