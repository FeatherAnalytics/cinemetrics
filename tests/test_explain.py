from recommend.explain import explain_recommendation


def test_returns_list_of_reasons():
    source = {
        "tmdb_id": 1, "title": "Blade Runner", "genres": "Drama, Sci-Fi",
        "keywords": "dystopia, future, android",
        "director": "Ridley Scott", "actors": "Harrison Ford",
    }
    target = {
        "tmdb_id": 2, "title": "Brazil", "genres": "Drama, Sci-Fi",
        "keywords": "dystopia, satire, bureaucracy",
        "director": "Terry Gilliam", "actors": "Jonathan Pryce",
    }
    genre_affinities = {"Sci-Fi": 8.0, "Drama": 2.0, "Comedy": -3.0}
    rated_films = {1: {"title": "Blade Runner", "rating": 90}}
    reasons = explain_recommendation(source, target, genre_affinities, rated_films)
    assert isinstance(reasons, list)
    assert 1 <= len(reasons) <= 3


def test_finds_shared_keywords():
    source = {
        "tmdb_id": 1, "keywords": "dystopia, future, android",
        "genres": "", "director": "", "actors": "",
    }
    target = {
        "tmdb_id": 2, "keywords": "dystopia, rebellion",
        "genres": "", "director": "", "actors": "",
    }
    reasons = explain_recommendation(source, target, {}, {})
    keyword_reasons = [r for r in reasons if "keyword" in r["type"]]
    assert len(keyword_reasons) >= 1
    assert "dystopia" in keyword_reasons[0]["text"].lower()


def test_finds_shared_director():
    source = {
        "tmdb_id": 1, "director": "Ridley Scott",
        "genres": "", "keywords": "", "actors": "",
    }
    target = {
        "tmdb_id": 2, "director": "Ridley Scott",
        "genres": "", "keywords": "", "actors": "",
    }
    rated_films = {1: {"title": "Alien", "rating": 90}}
    reasons = explain_recommendation(source, target, {}, rated_films)
    director_reasons = [r for r in reasons if r["type"] == "director"]
    assert len(director_reasons) >= 1


def test_includes_genre_affinity():
    source = {
        "tmdb_id": 1, "genres": "Horror",
        "keywords": "", "director": "", "actors": "",
    }
    target = {
        "tmdb_id": 2, "genres": "Horror",
        "keywords": "", "director": "", "actors": "",
    }
    genre_affinities = {"Horror": 12.0}
    reasons = explain_recommendation(source, target, genre_affinities, {})
    genre_reasons = [r for r in reasons if r["type"] == "genre"]
    assert len(genre_reasons) >= 1
    assert "+12" in genre_reasons[0]["text"]


def test_max_three_reasons():
    source = {
        "tmdb_id": 1, "genres": "Drama, Sci-Fi, Horror",
        "keywords": "dystopia, future, android, rebellion, war",
        "director": "Ridley Scott", "actors": "Harrison Ford",
    }
    target = {
        "tmdb_id": 2, "genres": "Drama, Sci-Fi, Horror",
        "keywords": "dystopia, future, android, rebellion, war",
        "director": "Ridley Scott", "actors": "Harrison Ford",
    }
    genre_affinities = {"Drama": 5.0, "Sci-Fi": 8.0, "Horror": 12.0}
    rated_films = {1: {"title": "Alien", "rating": 90}}
    reasons = explain_recommendation(source, target, genre_affinities, rated_films)
    assert len(reasons) <= 3
