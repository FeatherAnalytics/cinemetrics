"""Film recommendation engine: feature encoding, similarity, and explainability."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDS_DIR = ROOT / "transform" / "seeds"

FEATURE_WEIGHTS = {
    "keywords": 2.0,
    "genres": 3.0,
    "director": 0.0,
    "actors": 0.0,
    "country": 1.0,
    "critic_scores": 3.0,
}
