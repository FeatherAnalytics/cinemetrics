import { describe, expect, it } from "vitest";
import { computeGenreAffinities, explainRecommendation } from "../explainClient";
import type { CandidateMetadata } from "../recommend";

/**
 * A candidate as the embeddings artifact ships one: comma-joined strings, not
 * arrays. `Film` uses arrays for the same fields, which is why explainClient
 * carries a getter per field rather than reading them directly.
 */
function candidate(over: Partial<CandidateMetadata> = {}): CandidateMetadata {
  return {
    title: "Target",
    year: 2020,
    genres: "Horror, Drama",
    keywords: "cult, ritual",
    director: "Ari Aster",
    poster: null,
    ...over,
  } as CandidateMetadata;
}

const AFFINITIES = { Horror: 6.4, Drama: 1.2 };

describe("explainRecommendation", () => {
  it("explains a taste-based recommendation, which has no source film", () => {
    // The drawer opens in two modes. "similar" carries a source film; the
    // default taste mode carries none, and `sourceTmdbId` is null for it. The
    // genre-affinity reason needs only the target and the affinities, so it is
    // answerable either way -- and it is the ONLY honest explanation available
    // when there is no source, because the recommendation came from the whole
    // rating history rather than from one film.
    const reasons = explainRecommendation(undefined, candidate(), AFFINITIES);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.map((r) => r.type)).toContain("genre");
  });

  it("picks the target's strongest genre, not its first", () => {
    const reasons = explainRecommendation(undefined, candidate(), AFFINITIES);
    // Horror at +6.4 beats Drama at +1.2, and the label rounds.
    expect(reasons.find((r) => r.type === "genre")?.text).toBe(
      "I rate Horror +6 above avg",
    );
  });

  it("claims no genre affinity when every genre sits at or below average", () => {
    const reasons = explainRecommendation(undefined, candidate(), {
      Horror: -3,
      Drama: 0,
    });
    expect(reasons.map((r) => r.type)).not.toContain("genre");
  });

  it("adds the shared keywords and director once a source film is present", () => {
    const source = candidate({
      title: "Source",
      keywords: "cult, ritual, folk horror",
      director: "Ari Aster",
    });
    const reasons = explainRecommendation(source, candidate(), AFFINITIES);
    const types = reasons.map((r) => r.type);
    expect(types).toContain("keywords");
    expect(types).toContain("director");
    expect(types).toContain("genre");
  });

  it("never returns more than three reasons, so a card cannot grow unbounded", () => {
    const source = candidate({
      keywords: "cult, ritual, folk horror, sweden, daylight",
      director: "Ari Aster",
    });
    expect(
      explainRecommendation(source, candidate(), AFFINITIES).length,
    ).toBeLessThanOrEqual(3);
  });
});

describe("computeGenreAffinities", () => {
  it("scores a genre by how far its mean rating sits from the overall mean", () => {
    const films = [
      { tmdb_id: 1, genres: ["Horror"] },
      { tmdb_id: 2, genres: ["Comedy"] },
    ] as never;
    const affinities = computeGenreAffinities(films, [
      { tmdb_id: 1, rating: 90 },
      { tmdb_id: 2, rating: 70 },
    ]);
    // Overall mean is 80, so Horror is +10 and Comedy -10.
    expect(affinities.Horror).toBeCloseTo(10, 6);
    expect(affinities.Comedy).toBeCloseTo(-10, 6);
  });
});
