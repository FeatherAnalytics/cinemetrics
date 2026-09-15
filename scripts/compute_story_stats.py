"""Compute story statistics from the built marts for the narrative beats.

Reads fct_watches + dim_film, runs Kruskal-Wallis tests on rating_100 across
month, weekday, and primary genre, and computes the volume contrasts the story
needs. All figures land in web/public/data/story-stats.json and are registered
as stat markers so CI keeps the prose honest.

    uv run python scripts/compute_story_stats.py
"""

import json
from pathlib import Path

import duckdb
from scipy.stats import kruskal

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "movies.duckdb"
OUT = ROOT / "web" / "public" / "data" / "story-stats.json"

GENRE_ORDER = ["Horror", "Thriller", "Drama", "Comedy", "Adventure"]


def _primary_genre(genres_str: str) -> str:
    """Assign the first matching filter-rail genre, or Other."""
    for g in GENRE_ORDER:
        if g in (genres_str or ""):
            return g
    return "Other"


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"{DB.relative_to(ROOT)} missing — run `make build` first.")

    con = duckdb.connect(str(DB), read_only=True)

    rows = con.execute("""
        select
            w.rating_100,
            w.watched_date,
            month(w.watched_date) as watch_month,
            dayofweek(w.watched_date) as watch_dow,
            year(w.watched_date) as watch_year,
            w.is_rewatch_effective,
            w.is_return,
            w.liked,
            f.genres
        from marts.fct_watches w
        left join marts.dim_film f on w.tmdb_id = f.tmdb_id
    """).fetchdf()
    con.close()

    first_with_rating = rows[
        (~rows["is_rewatch_effective"]) & (rows["rating_100"].notna())
    ].copy()
    first_with_rating["primary_genre"] = first_with_rating["genres"].apply(_primary_genre)  # type: ignore[arg-type]

    def kw_test(column: str) -> dict:
        groups = [g["rating_100"].values for _, g in first_with_rating.groupby(column)]  # type: ignore[union-attr]
        groups = [g for g in groups if len(g) >= 2]
        if len(groups) < 2:
            return {"H": 0, "p": 1.0, "groups": 0, "n": 0}
        stat, p = kruskal(*groups)
        return {
            "H": round(float(stat), 2),
            "p": round(float(p), 2),
            "groups": len(groups),
            "n": int(sum(len(g) for g in groups)),
        }

    month_test = kw_test("watch_month")
    weekday_test = kw_test("watch_dow")
    genre_test = kw_test("primary_genre")

    all_ratings = first_with_rating["rating_100"]
    mid_share = round(float(((all_ratings >= 60) & (all_ratings <= 80)).mean()), 2)

    by_month = {int(k): int(v) for k, v in rows.groupby("watch_month").size().items()}  # type: ignore[call-overload]
    oct_watches = by_month.get(10, 0)
    nov_watches = by_month.get(11, 0)
    oct_nov_ratio = round(oct_watches / max(nov_watches, 1), 1)

    by_year = {int(k): int(v) for k, v in rows.groupby("watch_year").size().items()}  # type: ignore[call-overload]
    pandemic = by_year.get(2020, 0) + by_year.get(2021, 0)
    max_year = int(max(by_year))
    latest_full_year = max(y for y in by_year if y < max_year)
    latest_watches = by_year.get(latest_full_year, 0)
    pandemic_ratio = round(pandemic / max(latest_watches, 1), 1)

    answerable = rows[(rows["liked"].notna()) | (rows["is_return"])]
    years_with_enough = {int(k): int(v) for k, v in answerable.groupby("watch_year").size().items()}  # type: ignore[call-overload]
    valid_years = [y for y in years_with_enough if years_with_enough[y] >= 10]
    if len(valid_years) >= 2:
        first_year, last_year = min(valid_years), max(valid_years)
        fy = answerable[answerable["watch_year"] == first_year]
        ly = answerable[answerable["watch_year"] == last_year]
        rewatch_first = round(float(fy["is_rewatch_effective"].mean()), 3)  # type: ignore[arg-type]
        rewatch_last = round(float(ly["is_rewatch_effective"].mean()), 3)  # type: ignore[arg-type]
    else:
        first_year = last_year = 0
        rewatch_first = rewatch_last = 0.0

    stats = {
        "kruskal_month": month_test,
        "kruskal_weekday": weekday_test,
        "kruskal_genre": genre_test,
        "p_month": month_test["p"],
        "p_weekday": weekday_test["p"],
        "p_genre": genre_test["p"],
        "mid_rating_share": mid_share,
        "oct_watches": oct_watches,
        "nov_watches": nov_watches,
        "oct_nov_ratio": oct_nov_ratio,
        "pandemic_watches": pandemic,
        "latest_full_year": latest_full_year,
        "latest_watches": latest_watches,
        "pandemic_ratio": pandemic_ratio,
        "rewatch_first_year": first_year,
        "rewatch_first_share": rewatch_first,
        "rewatch_last_year": last_year,
        "rewatch_last_share": rewatch_last,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(stats, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  month p={stats['p_month']}, weekday p={stats['p_weekday']}, "
          f"genre p={stats['p_genre']}")
    print(f"  60-80 share: {mid_share}, Oct/Nov: {oct_watches}/{nov_watches} "
          f"({oct_nov_ratio}x)")


if __name__ == "__main__":
    main()
