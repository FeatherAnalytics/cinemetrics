"""Train film embeddings and export for the recommendation engine.

Loads rated films from dim_film and candidates from dim_candidate,
encodes features, and exports embeddings.json for upload to R2.

Skips training if source data hasn't changed (hash check).
"""

import hashlib
import json
import sys
from pathlib import Path

import duckdb

from recommend import ROOT, SEEDS_DIR
from recommend.encode import FeatureEncoder
from recommend.model import build_embeddings_export

DB = ROOT / "data" / "movies.duckdb"
OUT_DIR = ROOT / "data" / "ml"
LAST_TRAIN = OUT_DIR / ".last_train"


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
    if LAST_TRAIN.exists() and LAST_TRAIN.read_text().strip() == current:
        return False
    return True


def _load_films(con: duckdb.DuckDBPyConnection) -> tuple[list[dict], dict[int, float]]:
    rows = con.execute("""
        select
            f.tmdb_id, f.imdb_id, f.title, f.release_year,
            f.genres, f.keywords, f.runtime_min as runtime,
            f.director, f.actors, f.metascore, f.rt_rating, f.imdb_rating,
            f.production_countries, f.rated, f.original_language as language
        from dim_film f
    """).fetchdf().to_dict("records")

    ratings_rows = con.execute("""
        select tmdb_id, max(rating_100) as rating
        from fct_watches
        where rating_100 is not null
        group by tmdb_id
    """).fetchdf().to_dict("records")
    ratings = {int(r["tmdb_id"]): float(r["rating"]) for r in ratings_rows}

    return rows, ratings


def _load_candidates(rated_ids: set[int]) -> list[dict]:
    csv_path = SEEDS_DIR / "candidate_enrichment.csv"
    if not csv_path.exists():
        return []
    import pandas as pd
    df = pd.read_csv(csv_path)
    df = df[~df["tmdb_id"].isin(rated_ids)]
    if "original_language" in df.columns:
        df = df.rename(columns={"original_language": "language"})

    cache_dir = ROOT / "data" / "raw" / "tmdb_candidates"
    titles, years = [], []
    for tid in df["tmdb_id"]:
        detail = cache_dir / f"detail_{int(tid)}.json"
        if detail.exists():
            d = json.loads(detail.read_text(encoding="utf-8"))
            titles.append(d.get("title", ""))
            rd = (d.get("release_date") or "")[:4]
            years.append(int(rd) if rd.isdigit() else None)
        else:
            titles.append("")
            years.append(None)
    df["title"] = titles
    df["release_year"] = years
    return df.to_dict("records")


def main(force: bool = False) -> None:
    if not _should_train(force):
        print("source data unchanged — skipping training")
        return

    print("loading films from DuckDB...")
    con = duckdb.connect(str(DB), read_only=True)
    rated_films, ratings = _load_films(con)
    con.close()
    candidates = _load_candidates(set(ratings.keys()))

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
    # v2 = sparse format. The old dense embeddings.json stays in the R2 bucket
    # so previously deployed builds keep working.
    emb_path = OUT_DIR / "embeddings-v2.json"

    emb_path.write_text(json.dumps(export), encoding="utf-8")

    LAST_TRAIN.write_text(_data_hash(), encoding="utf-8")

    emb_kb = emb_path.stat().st_size / 1024
    print(f"wrote {emb_path.name} ({emb_kb:.0f} KB)")
    print(f"embeddings: {matrix.shape[1]} dimensions, {len(ids)} films")


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
