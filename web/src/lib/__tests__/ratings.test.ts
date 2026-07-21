import { describe, it, expect } from "vitest";

/**
 * Rating conversion: Letterboxd stars (0.5–5) map to a 0–100 scale.
 * The pipeline does this server-side, but we test the math here to
 * ensure client assumptions hold.
 */
function starsToRating(stars: number): number {
  return (stars / 5) * 100;
}

describe("rating conversions", () => {
  it("converts 5 stars to 100", () => {
    expect(starsToRating(5)).toBe(100);
  });

  it("converts 0.5 stars to 10", () => {
    expect(starsToRating(0.5)).toBe(10);
  });

  it("converts 3 stars to 60", () => {
    expect(starsToRating(3)).toBe(60);
  });

  it("converts 4.5 stars to 90", () => {
    expect(starsToRating(4.5)).toBe(90);
  });

  it("rating values stay in 0–100 range", () => {
    for (let s = 0.5; s <= 5; s += 0.5) {
      const r = starsToRating(s);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    }
  });
});
