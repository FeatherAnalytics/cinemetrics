import { describe, it, expect } from "vitest";
import { recommendReducer, initialRecommendState, type RecommendState } from "../recommendStore";

describe("recommendReducer", () => {
  const base: RecommendState = { ...initialRecommendState };

  it("opens drawer in similar mode", () => {
    const next = recommendReducer(base, { type: "OPEN_SIMILAR", tmdbId: 42 });
    expect(next.open).toBe(true);
    expect(next.mode).toBe("similar");
    expect(next.sourceTmdbId).toBe(42);
  });

  it("opens drawer in recommend mode", () => {
    const next = recommendReducer(base, { type: "OPEN_RECOMMEND" });
    expect(next.open).toBe(true);
    expect(next.mode).toBe("recommend");
    expect(next.sourceTmdbId).toBeNull();
  });

  it("opens drawer in genre-recommend mode", () => {
    const next = recommendReducer(base, { type: "OPEN_GENRE_RECOMMEND", genre: "Horror" });
    expect(next.open).toBe(true);
    expect(next.mode).toBe("genre-recommend");
    expect(next.genre).toBe("Horror");
  });

  it("closes drawer and resets", () => {
    const opened = recommendReducer(base, { type: "OPEN_SIMILAR", tmdbId: 42 });
    const closed = recommendReducer(opened, { type: "CLOSE" });
    expect(closed.open).toBe(false);
    expect(closed.sourceTmdbId).toBeNull();
  });

  it("toggles language filter", () => {
    const next = recommendReducer(base, { type: "SET_LANGUAGE", language: "en" });
    expect(next.filters.language).toBe("en");
  });

  it("toggles hide-rated", () => {
    const next = recommendReducer(base, { type: "TOGGLE_HIDE_RATED" });
    expect(next.hideRated).toBe(false);
    const next2 = recommendReducer(next, { type: "TOGGLE_HIDE_RATED" });
    expect(next2.hideRated).toBe(true);
  });
});
