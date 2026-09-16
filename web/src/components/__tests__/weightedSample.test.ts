import { describe, it, expect } from "vitest";
import { weightedSample } from "../RecommendDrawer";
import type { Recommendation } from "@/lib/recommend";

function makePool(n: number): Recommendation[] {
  return Array.from({ length: n }, (_, i) => ({
    tmdb_id: i,
    score: 1.0 - i * (1.0 / n),
    cosineScore: 1.0 - i * (1.0 / n),
    metadata: { tmdb_id: i } as unknown as Recommendation["metadata"],
  }));
}

describe("weightedSample", () => {
  it("draws only from the top of the pool", () => {
    const pool = makePool(1000);
    for (let trial = 0; trial < 50; trial++) {
      const picks = weightedSample(pool, 10);
      for (const pick of picks) {
        expect(pick.tmdb_id).toBeLessThan(50);
      }
    }
  });
});
