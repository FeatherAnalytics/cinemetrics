import numpy as np

from recommend.encode import FeatureEncoder, encode_films

FILMS = [
    {
        "tmdb_id": 1,
        "genres": "Drama, Sci-Fi",
        "keywords": "dystopia, future, android",
        "director": "Ridley Scott",
        "actors": "Harrison Ford, Rutger Hauer",
        "production_countries": "US, GB",
        "metascore": 84,
        "rt_rating": 89,
        "imdb_rating": 8.1,
    },
    {
        "tmdb_id": 2,
        "genres": "Drama",
        "keywords": "dystopia, totalitarianism",
        "director": "Terry Gilliam",
        "actors": "Jonathan Pryce, Robert De Niro",
        "production_countries": "GB",
        "metascore": 88,
        "rt_rating": 98,
        "imdb_rating": 7.9,
    },
    {
        "tmdb_id": 3,
        "genres": "Comedy",
        "keywords": "wedding, romance",
        "director": "Rob Reiner",
        "actors": "Billy Crystal, Meg Ryan",
        "production_countries": "US",
        "metascore": 76,
        "rt_rating": 96,
        "imdb_rating": 7.7,
    },
]


class TestFeatureEncoder:
    def test_fit_transform_returns_matrix(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        assert isinstance(matrix, np.ndarray)
        assert matrix.shape[0] == 3

    def test_vectors_are_normalized(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        norms = np.linalg.norm(matrix, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-6)

    def test_similar_films_have_higher_cosine(self):
        enc = FeatureEncoder()
        matrix = enc.fit_transform(FILMS)
        sim_01 = np.dot(matrix[0], matrix[1])
        sim_02 = np.dot(matrix[0], matrix[2])
        assert sim_01 > sim_02, "Sci-fi dystopia films should be more similar than sci-fi vs comedy"

    def test_transform_new_film(self):
        enc = FeatureEncoder()
        train_matrix = enc.fit_transform(FILMS)
        new_film = {
            "tmdb_id": 99,
            "genres": "Sci-Fi",
            "keywords": "android, future",
            "director": "Denis Villeneuve",
            "actors": "Ryan Gosling",
            "production_countries": "US",
            "metascore": 81,
            "rt_rating": 88,
            "imdb_rating": 7.8,
        }
        vec = enc.transform([new_film])
        assert vec.shape == (1, train_matrix.shape[1])
        norm = np.linalg.norm(vec[0])
        assert abs(norm - 1.0) < 1e-6

    def test_handles_missing_fields(self):
        sparse_film = {"tmdb_id": 50, "genres": "Drama", "keywords": ""}
        enc = FeatureEncoder()
        enc.fit_transform(FILMS)
        vec = enc.transform([sparse_film])
        assert not np.any(np.isnan(vec))


class TestEncodeFilms:
    def test_returns_dict_keyed_by_tmdb_id(self):
        enc = FeatureEncoder()
        result = encode_films(FILMS, enc)
        assert set(result.keys()) == {1, 2, 3}
        assert all(isinstance(v, np.ndarray) for v in result.values())
