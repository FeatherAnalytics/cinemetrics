"""Feature encoding pipeline for film embeddings."""

import numpy as np
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from recommend import FEATURE_WEIGHTS

_CRITIC_SCALES = {"metascore": 100.0, "rt_rating": 100.0, "imdb_rating": 10.0}


def _safe_str(val: object) -> str:
    if val is None or (isinstance(val, float) and val != val):
        return ""
    return str(val).strip()


def _split_comma(val: object) -> list[str]:
    s = _safe_str(val)
    return [v.strip() for v in s.split(",") if v.strip()]


class FeatureEncoder:
    """Encodes film metadata into dense feature vectors for similarity search."""

    def __init__(self) -> None:
        self._keyword_tfidf = TfidfVectorizer(max_features=200)
        self._genre_vocab: list[str] = []
        self._director_vocab: list[str] = []
        self._actor_vocab: list[str] = []
        self._country_vocab: list[str] = []
        self._critic_means: dict[str, float] = {}
        self._fitted = False

    def fit_transform(self, films: list[dict]) -> sp.csr_matrix:
        kw_texts = [_safe_str(f.get("keywords")) for f in films]
        kw_matrix = self._keyword_tfidf.fit_transform(kw_texts)

        all_genres = sorted({g for f in films for g in _split_comma(f.get("genres"))})
        self._genre_vocab = all_genres

        dir_counts: dict[str, int] = {}
        for f in films:
            for d in _split_comma(f.get("director")):
                dir_counts[d] = dir_counts.get(d, 0) + 1
        self._director_vocab = sorted(dir_counts, key=lambda d: (-dir_counts[d], d))[:50]

        act_counts: dict[str, int] = {}
        for f in films:
            for a in _split_comma(f.get("actors")):
                act_counts[a] = act_counts.get(a, 0) + 1
        self._actor_vocab = sorted(act_counts, key=lambda a: (-act_counts[a], a))[:100]

        all_countries = sorted(
            {c for f in films for c in _split_comma(f.get("production_countries"))}
        )
        self._country_vocab = all_countries

        self._critic_means = self._compute_critic_means(films)
        self._fitted = True
        return self._build_matrix(films, kw_matrix)

    def feature_names(self) -> list[str]:
        """One name per dimension, in the order _build_matrix concatenates them."""
        if not self._fitted:
            raise RuntimeError("Call fit_transform first")
        names: list[str] = []
        names.extend(f"kw:{w}" for w in self._keyword_tfidf.get_feature_names_out())
        names.extend(f"genre:{g}" for g in self._genre_vocab)
        names.extend(f"director:{d}" for d in self._director_vocab)
        names.extend(f"actor:{a}" for a in self._actor_vocab)
        names.extend(f"country:{c}" for c in self._country_vocab)
        names.extend(f"critic:{k}" for k in _CRITIC_SCALES)
        return names

    def transform(self, films: list[dict]) -> sp.csr_matrix:
        if not self._fitted:
            raise RuntimeError("Call fit_transform first")
        kw_texts = [_safe_str(f.get("keywords")) for f in films]
        kw_matrix = self._keyword_tfidf.transform(kw_texts)
        return self._build_matrix(films, kw_matrix)  # type: ignore[arg-type]

    def _build_matrix(self, films: list[dict], kw_matrix: sp.spmatrix) -> sp.csr_matrix:
        w = FEATURE_WEIGHTS
        parts: list[sp.spmatrix] = [kw_matrix * w["keywords"]]

        genre_mat = self._multi_hot(films, "genres", self._genre_vocab)
        parts.append(genre_mat * w["genres"])

        dir_mat = self._multi_hot(films, "director", self._director_vocab)
        parts.append(dir_mat * w["director"])

        act_mat = self._multi_hot(films, "actors", self._actor_vocab)
        parts.append(act_mat * w["actors"])

        country_mat = self._multi_hot(films, "production_countries", self._country_vocab)
        parts.append(country_mat * w["country"])

        critic_keys = list(_CRITIC_SCALES.keys())
        critic = np.zeros((len(films), len(critic_keys)))
        for i, f in enumerate(films):
            for j, key in enumerate(critic_keys):
                v = f.get(key)
                if isinstance(v, (int, float)) and v == v:
                    critic[i, j] = v / _CRITIC_SCALES[key]
                else:
                    critic[i, j] = self._critic_means.get(key, 0.0)
        parts.append(sp.csr_matrix(critic * w["critic_scores"]))

        combined = sp.hstack(parts, format="csr")
        return normalize(combined, norm="l2")  # type: ignore[return-value]

    @staticmethod
    def _compute_critic_means(films: list[dict]) -> dict[str, float]:
        sums: dict[str, float] = dict.fromkeys(_CRITIC_SCALES, 0.0)
        counts: dict[str, int] = dict.fromkeys(_CRITIC_SCALES, 0)
        for f in films:
            for key, scale in _CRITIC_SCALES.items():
                v = f.get(key)
                if isinstance(v, (int, float)) and v == v:
                    sums[key] += v / scale
                    counts[key] += 1
        return {k: (sums[k] / counts[k] if counts[k] else 0.0) for k in sums}

    def _multi_hot(self, films: list[dict], field: str, vocab: list[str]) -> sp.csr_matrix:
        idx = {v: i for i, v in enumerate(vocab)}
        rows, cols = [], []
        for row, f in enumerate(films):
            for val in _split_comma(f.get(field)):
                if val in idx:
                    rows.append(row)
                    cols.append(idx[val])
        data = np.ones(len(rows), dtype=np.float64)
        return sp.csr_matrix((data, (rows, cols)), shape=(len(films), len(vocab)))


def encode_films(films: list[dict], encoder: FeatureEncoder) -> dict[int, np.ndarray]:
    matrix = encoder.fit_transform(films) if not encoder._fitted else encoder.transform(films)
    dense = matrix.toarray() if sp.issparse(matrix) else matrix
    return {f["tmdb_id"]: dense[i] for i, f in enumerate(films)}
