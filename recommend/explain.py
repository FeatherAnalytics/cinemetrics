"""Generate human-readable explanations for why a film was recommended."""


def _split(val: str | None) -> list[str]:
    return [s.strip() for s in (val or "").split(",") if s.strip()]


def explain_recommendation(
    source: dict,
    target: dict,
    genre_affinities: dict[str, float],
    rated_films: dict[int, dict],
) -> list[dict]:
    """Return up to 3 explanation reasons, sorted by relevance."""
    reasons: list[dict] = []

    source_kw = set(_split(source.get("keywords")))
    target_kw = set(_split(target.get("keywords")))
    shared_kw = source_kw & target_kw
    if shared_kw:
        top_kw = sorted(shared_kw)[:3]
        reasons.append({
            "type": "keywords",
            "text": f"Keywords: {', '.join(top_kw)}",
            "score": len(shared_kw),
        })

    source_dirs = set(_split(source.get("director")))
    target_dirs = set(_split(target.get("director")))
    shared_dirs = source_dirs & target_dirs
    if shared_dirs:
        director_name = next(iter(shared_dirs))
        rated_by_dir = [
            v for tid, v in rated_films.items()
            if director_name.lower() in (rated_films.get(tid, {}).get("director", "") or "").lower()
        ]
        if rated_by_dir:
            best = max(rated_by_dir, key=lambda x: x.get("rating", 0))
            reasons.append({
                "type": "director",
                "text": f"Same director as {best['title']} (rated {int(best['rating'])})",
                "score": 5,
            })
        else:
            reasons.append({
                "type": "director",
                "text": f"Director: {director_name}",
                "score": 4,
            })

    target_genres = _split(target.get("genres"))
    best_genre_boost = 0.0
    best_genre_name = ""
    for g in target_genres:
        boost = genre_affinities.get(g, 0.0)
        if abs(boost) > abs(best_genre_boost):
            best_genre_boost = boost
            best_genre_name = g
    if best_genre_name and best_genre_boost > 0:
        reasons.append({
            "type": "genre",
            "text": f"You rate {best_genre_name} +{int(best_genre_boost)} above avg",
            "score": best_genre_boost,
        })

    reasons.sort(key=lambda r: r["score"], reverse=True)
    return reasons[:3]
