from recommend.encode import FeatureEncoder
from recommend.model import build_embeddings_export

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
