"""Export the dbt marts to a single JSON the web app consumes.

Reads dim_film + fct_watches from DuckDB (read-only) and writes
web/public/data/cinemetrics.json as {films: [...], watches: [...]}.
Films and watches are kept separate and linked by tmdb_id to stay small.
"""

import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "movies.duckdb"
OUT = ROOT / "web" / "public" / "data" / "cinemetrics.json"


def records(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    rel = con.execute(sql)
    cols = [d[0] for d in rel.description]
    rows = []
    for r in rel.fetchall():
        rec = {}
        for c, v in zip(cols, r, strict=False):
            rec[c] = v.isoformat() if hasattr(v, "isoformat") else v
        rows.append(rec)
    return rows


def main() -> None:
    con = duckdb.connect(str(DB), read_only=True)

    films = records(
        con,
        """
        select
            tmdb_id,
            imdb_id,
            title,
            release_year                                               as year,
            list_filter(string_split(coalesce(genres, ''), ', '),   x -> x <> '') as genres,
            list_filter(string_split(coalesce(keywords, ''), ', '), x -> x <> '') as keywords,
            runtime_min                                                as runtime,
            budget,
            revenue,
            director,
            actors,
            metascore,
            rt_rating,
            imdb_rating,
            imdb_votes,
            list_filter(
                string_split(coalesce(dim_film.production_countries, ''), ', '),
                x -> x <> '') as production_countries,
            nullif(dim_film.rated, '')              as rated,
            nullif(dim_film.original_language, '')  as language,
            nullif(dim_film.collection, '')         as collection
        from dim_film
        """,
    )

    watches = records(
        con,
        """
        select
            watched_date as date,
            tmdb_id,
            rating_100   as rating,
            star_rating  as stars,
            is_rewatch   as rewatch
        from fct_watches
        order by watched_date
        """,
    )

    con.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"films": films, "watches": watches}), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(
        f"wrote {OUT.relative_to(ROOT)}: {len(films)} films, "
        f"{len(watches)} watches ({size_kb:.0f} KB)"
    )


if __name__ == "__main__":
    main()
