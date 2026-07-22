"""Film recommendation engine: feature encoding, similarity, and explainability."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDS_DIR = ROOT / "transform" / "seeds"

FEATURE_WEIGHTS = {
    "keywords": 3.0,
    "genres": 2.0,
    "director": 2.0,
    "actors": 2.0,
    "country": 1.5,
    "critic_scores": 1.0,
}
