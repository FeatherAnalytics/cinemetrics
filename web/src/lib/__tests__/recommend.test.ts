import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  topNSimilar,
  filterRecommendations,
  type EmbeddingData,
  type RecommendationFilters,
  type CandidateMetadata,
} from "../recommend";

const VECTORS: Record<number, number[]> = {
  1: [1, 0, 0, 0],
  2: [0.9, 0.1, 0, 0],
  3: [0, 0, 1, 0],
  4: [0.8, 0.2, 0, 0],
};

const METADATA: Record<number, CandidateMetadata> = {
  1: { title: "Film A", year: 2020, genres: "Sci-Fi", language: "en", runtime: 120, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000001", production_countries: "US", metascore: 80, rt_rating: 85, imdb_rating: 8.0 },
  2: { title: "Film B", year: 2019, genres: "Sci-Fi", language: "en", runtime: 90, rated: "PG-13", director: "", actors: "", keywords: "", imdb_id: "tt0000002", production_countries: "US", metascore: 75, rt_rating: 80, imdb_rating: 7.5 },
  3: { title: "Film C", year: 2021, genres: "Comedy", language: "fr", runtime: 110, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000003", production_countries: "FR", metascore: 70, rt_rating: 75, imdb_rating: 7.0 },
  4: { title: "Film D", year: 2018, genres: "Sci-Fi, Drama", language: "de", runtime: 150, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000004", production_countries: "DE", metascore: 90, rt_rating: 92, imdb_rating: 8.5 },
};

const DATA: EmbeddingData = { vectors: VECTORS, metadata: METADATA };

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it("returns value between 0 and 1 for similar vectors", () => {
    const sim = cosineSimilarity([1, 0, 0, 0], [0.9, 0.1, 0, 0]);
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1.0);
  });
});

describe("topNSimilar", () => {
  it("returns correct number of results", () => {
    const results = topNSimilar(1, DATA, 2, new Set([1]));
    expect(results).toHaveLength(2);
  });

  it("excludes specified ids", () => {
    const results = topNSimilar(1, DATA, 3, new Set([1]));
    expect(results.every((r) => r.tmdb_id !== 1)).toBe(true);
  });

  it("ranks by similarity", () => {
    const results = topNSimilar(1, DATA, 3, new Set([1]));
    expect(results[0].tmdb_id).toBe(2);
  });

  it("includes score and metadata", () => {
    const results = topNSimilar(1, DATA, 1, new Set([1]));
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].metadata.title).toBe("Film B");
  });
});

describe("filterRecommendations", () => {
  const recs = [
    { tmdb_id: 2, score: 0.99, metadata: METADATA[2] },
    { tmdb_id: 3, score: 0.1, metadata: METADATA[3] },
    { tmdb_id: 4, score: 0.95, metadata: METADATA[4] },
  ];

  it("filters english only", () => {
    const filters: RecommendationFilters = { language: "en" };
    const result = filterRecommendations(recs, filters);
    expect(result).toHaveLength(1);
    expect(result[0].tmdb_id).toBe(2);
  });

  it("filters non-english only", () => {
    const filters: RecommendationFilters = { language: "non-en" };
    const result = filterRecommendations(recs, filters);
    expect(result).toHaveLength(2);
  });

  it("filters by runtime range", () => {
    const filters: RecommendationFilters = { runtimeRange: [80, 100] };
    const result = filterRecommendations(recs, filters);
    expect(result).toHaveLength(1);
    expect(result[0].tmdb_id).toBe(2);
  });

  it("applies no filters when empty", () => {
    const result = filterRecommendations(recs, {});
    expect(result).toHaveLength(3);
  });
});
