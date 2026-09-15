"""Train film embeddings and export for the recommendation engine.

Loads rated films from marts.dim_film, candidates from marts.dim_candidate.
The mart applies canonical_genres(), so the encoder sees the same genre
vocabulary as the rated films.

Skips training if source data hasn't changed (hash check).
"""
import hashlib
import json
import sys
from pathlib import Path

import duckdb

from recommend.encode import FeatureEncoder
from recommend.model import build_embeddings_export, build_v3_binary, build_v3_metadata

ROOT = Path(__file__).resolve().parents[1]
SEEDS_DIR = ROOT / "transform" / "seeds"
DB = ROOT / "data" / "movies.duckdb"
OUT_DIR = ROOT / "data" / "ml"
LAST_TRAIN = OUT_DIR / ".last_train"
VERSION_FILE = ROOT / "web" / "public" / "data" / "embeddings-version.json"


def _file_hash(path: Path) -> str:
    if not path.exists():
        return ""
    return hashlib.md5(path.read_bytes()).hexdigest()


def _data_hash() -> str:
    film_hash = _file_hash(SEEDS_DIR / "film_log.csv")
    cand_hash = _file_hash(SEEDS_DIR / "candidate_enrichment.csv")
    enrich_hash = _file_hash(SEEDS_DIR / "film_enrichment.csv")
    return hashlib.md5(f"{film_hash}:{cand_hash}:{enrich_hash}".encode()).hexdigest()


def _should_train(force: bool = False) -> bool:
    if force:
        return True
    current = _data_hash()
    return not (LAST_TRAIN.exists() and LAST_TRAIN.read_text().strip() == current)


def _load_films(con: duckdb.DuckDBPyConnection) -> tuple[list[dict], dict[int, float]]:
    rows = con.execute("""
        select
            f.tmdb_id, f.imdb_id, f.title, f.release_year,
            f.genres, f.keywords, f.runtime_min as runtime,
            f.director, f.actors, f.metascore, f.rt_rating, f.imdb_rating,
            f.production_countries, f.rated, f.original_language as language,
            f.poster_path
        from marts.dim_film f
    """).fetchdf().to_dict("records")

    ratings_rows = con.execute("""
        select tmdb_id, max(rating_100) as rating
        from marts.fct_watches
        where rating_100 is not null
        group by tmdb_id
    """).fetchdf().to_dict("records")
    ratings = {int(r["tmdb_id"]): float(r["rating"]) for r in ratings_rows}

    return rows, ratings


def _load_candidates(con: duckdb.DuckDBPyConnection, rated_ids: set[int]) -> list[dict]:
    rows = con.execute("""
        select
            c.tmdb_id, c.imdb_id, c.title, c.release_year,
            c.genres, c.keywords, c.runtime_min as runtime,
            c.director, c.actors, c.metascore, c.rt_rating, c.imdb_rating,
            c.production_countries, c.rated, c.original_language as language,
            c.poster_path
        from marts.dim_candidate c
    """).fetchdf().to_dict("records")
    return [r for r in rows if int(r["tmdb_id"]) not in rated_ids]


def _write_version(data_hash: str) -> None:
    VERSION_FILE.write_text(
        json.dumps({"version": data_hash}, sort_keys=True) + "\n", encoding="utf-8"
    )


def main(force: bool = False) -> None:
    if not _should_train(force):
        print("source data unchanged — skipping training")
        if not VERSION_FILE.exists():
            _write_version(_data_hash())
        return

    print("loading films from DuckDB...")
    con = duckdb.connect(str(DB), read_only=True)
    rated_films, ratings = _load_films(con)
    candidates = _load_candidates(con, set(ratings.keys()))
    con.close()

    all_films = rated_films + candidates
    print(
        f"encoding {len(rated_films)} rated + {len(candidates)} candidates"
        f" = {len(all_films)} total"
    )

    encoder = FeatureEncoder()
    matrix = encoder.fit_transform(all_films)
    ids = [f["tmdb_id"] for f in all_films]

    print("building export...")
    export = build_embeddings_export(matrix, ids, all_films)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # v2: kept for one release so stale browser caches still resolve.
    emb_v2 = OUT_DIR / "embeddings-v2.json"
    emb_v2.write_text(json.dumps(export), encoding="utf-8")

    # v3: binary-packed vectors, separate metadata and feature names.
    v3_bin = OUT_DIR / "embeddings-v3.bin"
    v3_bin.write_bytes(build_v3_binary(matrix, ids))

    ndims = matrix.shape[1]  # type: ignore[index]
    v3_features = OUT_DIR / "features-v3.json"
    v3_features.write_text(
        json.dumps({"dims": int(ndims), "names": encoder.feature_names()}, sort_keys=True),
        encoding="utf-8",
    )

    v3_meta = OUT_DIR / "metadata-v3.json"
    v3_meta.write_text(json.dumps(build_v3_metadata(all_films)), encoding="utf-8")

    data_hash = _data_hash()
    LAST_TRAIN.write_text(data_hash, encoding="utf-8")
    _write_version(data_hash)

    v2_kb = emb_v2.stat().st_size / 1024
    v3_kb = v3_bin.stat().st_size / 1024
    meta_kb = v3_meta.stat().st_size / 1024
    print(f"wrote v2 ({v2_kb:.0f} KB), v3 bin ({v3_kb:.0f} KB) + meta ({meta_kb:.0f} KB)")
    print(f"embeddings: {matrix.shape[1]} dimensions, {len(ids)} films")  # type: ignore


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
