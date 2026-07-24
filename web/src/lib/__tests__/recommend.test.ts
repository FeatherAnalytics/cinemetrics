import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  sparseCosine,
  decodeEmbeddings,
  topNSimilar,
  filterRecommendations,
  scoreByTaste,
  tasteVector,
  type EmbeddingData,
  type RecommendationFilters,
  type CandidateMetadata,
  type SparseVec,
} from "../recommend";

// Sparse encodings of the dense fixtures [1,0,0,0], [0.9,0.1,0,0], [0,0,1,0],
// [0.8,0.2,0,0].
const VECTORS: Record<number, SparseVec> = {
  1: { idx: [0], val: [1] },
  2: { idx: [0, 1], val: [0.9, 0.1] },
  3: { idx: [2], val: [1] },
  4: { idx: [0, 1], val: [0.8, 0.2] },
};

function dense(s: SparseVec, dims = 4): number[] {
  const out = new Array<number>(dims).fill(0);
  for (let i = 0; i < s.idx.length; i++) out[s.idx[i]] = s.val[i];
  return out;
}

const METADATA: Record<number, CandidateMetadata> = {
  1: { title: "Film A", year: 2020, genres: "Sci-Fi", language: "en", runtime: 120, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000001", production_countries: "US", metascore: 80, rt_rating: 85, imdb_rating: 8.0 },
  2: { title: "Film B", year: 2019, genres: "Sci-Fi", language: "en", runtime: 90, rated: "PG-13", director: "", actors: "", keywords: "", imdb_id: "tt0000002", production_countries: "US", metascore: 75, rt_rating: 80, imdb_rating: 7.5 },
  3: { title: "Film C", year: 2021, genres: "Comedy", language: "fr", runtime: 110, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000003", production_countries: "FR", metascore: 70, rt_rating: 75, imdb_rating: 7.0 },
  4: { title: "Film D", year: 2018, genres: "Sci-Fi, Drama", language: "de", runtime: 150, rated: "R", director: "", actors: "", keywords: "", imdb_id: "tt0000004", production_countries: "DE", metascore: 90, rt_rating: 92, imdb_rating: 8.5 },
};

const DATA: EmbeddingData = { dims: 4, vectors: VECTORS, metadata: METADATA };

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

describe("sparseCosine", () => {
  it("matches dense cosine on the fixtures", () => {
    for (const a of [1, 2, 3, 4]) {
      for (const b of [1, 2, 3, 4]) {
        expect(sparseCosine(VECTORS[a], VECTORS[b])).toBeCloseTo(
          cosineSimilarity(dense(VECTORS[a]), dense(VECTORS[b])),
        );
      }
    }
  });
});

describe("decodeEmbeddings", () => {
  it("converts [indices, values] pairs into SparseVec objects", () => {
    const decoded = decodeEmbeddings({
      dims: 4,
      vectors: { 1: [[0, 2], [0.5, 0.5]] },
      metadata: { 1: METADATA[1] },
    });
    expect(decoded.dims).toBe(4);
    expect(decoded.vectors[1]).toEqual({ idx: [0, 2], val: [0.5, 0.5] });
    expect(decoded.metadata[1].title).toBe("Film A");
  });
});

describe("tasteVector", () => {
  it("points toward highly rated films", () => {
    const taste = tasteVector(DATA, [{ tmdb_id: 1, rating: 100 }]);
    expect(taste).not.toBeNull();
    expect(cosineSimilarity(taste!, dense(VECTORS[1]))).toBeCloseTo(1.0);
  });

  it("points away from disliked films", () => {
    // Loved film 1 ([1,0,0,0]), hated film 3 ([0,0,1,0]): the taste vector's
    // third component goes negative.
    const taste = tasteVector(DATA, [
      { tmdb_id: 1, rating: 100 },
      { tmdb_id: 3, rating: 20 },
    ]);
    expect(taste![0]).toBeGreaterThan(0);
    expect(taste![2]).toBeLessThan(0);
  });

  it("averages rewatch ratings per film instead of double-counting", () => {
    const twice = tasteVector(DATA, [
      { tmdb_id: 1, rating: 80 },
      { tmdb_id: 1, rating: 100 },
    ]);
    const once = tasteVector(DATA, [{ tmdb_id: 1, rating: 90 }]);
    expect(twice).toEqual(once);
  });

  it("returns null when no rated film has an embedding", () => {
    expect(tasteVector(DATA, [{ tmdb_id: 999, rating: 90 }])).toBeNull();
    expect(tasteVector(DATA, [{ tmdb_id: 1, rating: null }])).toBeNull();
    expect(tasteVector(DATA, [])).toBeNull();
  });
});

describe("scoreByTaste", () => {
  it("scores candidates similar to taste higher", () => {
    const taste = tasteVector(DATA, [{ tmdb_id: 1, rating: 100 }])!;
    const scored = scoreByTaste(taste, DATA, new Set([1]));
    const byId = new Map(scored.map((r) => [r.tmdb_id, r.score]));
    expect(byId.get(2)!).toBeGreaterThan(byId.get(3)!);
  });

  it("excludes ids and clamps scores at zero", () => {
    const taste = [-1, 0, 0, 0]; // opposite of film 1's direction
    const scored = scoreByTaste(taste, DATA, new Set([2]));
    expect(scored.every((r) => r.tmdb_id !== 2)).toBe(true);
    expect(scored.every((r) => r.score >= 0)).toBe(true);
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
