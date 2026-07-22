from recommend.encode import FeatureEncoder
from recommend.model import RatingPredictor, build_embeddings_export

FILMS = [
    {"tmdb_id": 1, "genres": "Drama, Sci-Fi", "keywords": "dystopia, future, android",
     "director": "Ridley Scott", "actors": "Harrison Ford", "production_countries": "US",
     "metascore": 84, "rt_rating": 89, "imdb_rating": 8.1},
    {"tmdb_id": 2, "genres": "Drama, Sci-Fi", "keywords": "dystopia, totalitarianism",
     "director": "Terry Gilliam", "actors": "Jonathan Pryce", "production_countries": "GB",
     "metascore": 88, "rt_rating": 98, "imdb_rating": 7.9},
    {"tmdb_id": 3, "genres": "Comedy", "keywords": "wedding, romance",
     "director": "Rob Reiner", "actors": "Billy Crystal", "production_countries": "US",
     "metascore": 76, "rt_rating": 96, "imdb_rating": 7.7},
]

RATINGS = {1: 90.0, 2: 85.0, 3: 60.0}


class TestRatingPredictor:
    def test_predictions_in_valid_range(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        ids = [f["tmdb_id"] for f in FILMS]
        predictor = RatingPredictor()
        predictor.fit(matrix, ids, RATINGS)
        preds = predictor.predict(matrix)
        assert all(0 <= p <= 100 for p in preds)

    def test_predicts_for_new_films(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        ids = [f["tmdb_id"] for f in FILMS]
        predictor = RatingPredictor()
        predictor.fit(matrix, ids, RATINGS)
        new_vec = enc.transform([{
            "tmdb_id": 99, "genres": "Sci-Fi", "keywords": "future",
            "director": "", "actors": "", "production_countries": "",
            "metascore": 80, "rt_rating": 85, "imdb_rating": 7.5,
        }])
        pred = predictor.predict(new_vec)
        assert len(pred) == 1
        assert 0 <= pred[0] <= 100


class TestBuildExport:
    def test_export_structure(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        ids = [f["tmdb_id"] for f in FILMS]
        export = build_embeddings_export(matrix, ids, FILMS)
        assert "vectors" in export
        assert "metadata" in export
        assert len(export["vectors"]) == 3
        assert all(tmdb_id in export["vectors"] for tmdb_id in [1, 2, 3])
        assert all(isinstance(v, list) for v in export["vectors"].values())
