import { describe, expect, it } from "vitest";
import { contrastiveExplain, type ExplainContext } from "../explainClient";
import type { CandidateMetadata, SparseVec } from "../recommend";

function meta(over: Partial<CandidateMetadata> = {}): CandidateMetadata {
  return {
    title: "Target",
    year: 2020,
    genres: "Horror, Drama",
    runtime: 120,
    rated: "R",
    language: "en",
    production_countries: "US",
    metascore: 80,
    rt_rating: 85,
    imdb_rating: 8.0,
    imdb_id: "tt1",
    poster: null,
    ...over,
  };
}

const FEATURE_NAMES = [
  "kw:dystopia", "kw:cult", "genre:Horror", "genre:Drama", "director:Aster",
];

function makeCtx(overrides: Partial<ExplainContext> = {}): ExplainContext {
  return {
    taste: [0.8, 0.1, 0.5, 0.2, 0.3],
    featureNames: FEATURE_NAMES,
    watches: [
      { tmdb_id: 10, rating: 90 },
      { tmdb_id: 20, rating: 85 },
    ],
    vectors: {
      10: { idx: [0, 2], val: [0.5, 0.3] },
      20: { idx: [0, 3], val: [0.4, 0.2] },
    },
    metadata: {
      10: meta({ title: "Film A", tmdb_id: 10 } as never),
      20: meta({ title: "Film B", tmdb_id: 20 } as never),
    },
    lambda: 0.5,
    poolMean: 0.7,
    ...overrides,
  };
}

describe("contrastiveExplain", () => {
  it("a dominant keyword dimension yields a keyword reason first", () => {
    const filmVec: SparseVec = { idx: [0], val: [0.9] };
    const ctx = makeCtx({ taste: [1, 0, 0, 0, 0] });
    const reasons = contrastiveExplain(filmVec, meta(), ctx);
    expect(reasons[0].type).toBe("keyword");
    expect(reasons[0].text).toContain("dystopia");
  });

  it("a dominant genre dimension yields a genre reason", () => {
    const filmVec: SparseVec = { idx: [2], val: [0.9] };
    const ctx = makeCtx({ taste: [0, 0, 1, 0, 0] });
    const reasons = contrastiveExplain(filmVec, meta(), ctx);
    expect(reasons[0].type).toBe("genre");
    expect(reasons[0].text).toContain("Horror");
  });

  it("adds a critic line when the prior dominates", () => {
    const filmVec: SparseVec = { idx: [0], val: [0.01] };
    const ctx = makeCtx({
      taste: [0.01, 0, 0, 0, 0],
      lambda: 1,
    });
    const reasons = contrastiveExplain(filmVec, meta({ metascore: 95, rt_rating: 92, imdb_rating: 9.0 }), ctx);
    const criticReason = reasons.find((r) => r.type === "critic");
    expect(criticReason).toBeDefined();
    expect(criticReason!.text).toContain("critics rate it");
  });

  it("keyword reason names two watched films with that dimension", () => {
    const filmVec: SparseVec = { idx: [0], val: [0.9] };
    const ctx = makeCtx({ taste: [1, 0, 0, 0, 0] });
    const reasons = contrastiveExplain(filmVec, meta(), ctx);
    expect(reasons[0].text).toContain("Film A");
    expect(reasons[0].text).toContain("Film B");
  });

  it("returns empty when the film has no positive contributions", () => {
    const filmVec: SparseVec = { idx: [0], val: [0.5] };
    const ctx = makeCtx({ taste: [-1, 0, 0, 0, 0], lambda: 0 });
    const reasons = contrastiveExplain(filmVec, meta({ metascore: null, rt_rating: null, imdb_rating: null }), ctx);
    expect(reasons).toHaveLength(0);
  });
});
