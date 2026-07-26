import { describe, it, expect } from "vitest";
import {
  admiredNotLoved,
  byRewatch,
  byRuntimeBand,
  byStarBin,
  CROSSOVER_STARS,
  crossoverWatches,
  hasKnownLike,
  knownWatches,
  likedByWatchYear,
  likedRate,
  lovedNotAdmired,
  RUNTIME_BANDS,
  runtimeBandIndex,
  starBinIndex,
  starLabel,
  STAR_BINS,
} from "../likedChart";
import type { EnrichedWatch, Film } from "../types";

function film(over: Partial<Film> = {}): Film {
  return {
    tmdb_id: 1,
    imdb_id: "tt1",
    title: "A Film",
    year: 2020,
    genres: ["Drama"],
    keywords: [],
    runtime: 100,
    budget: null,
    revenue: null,
    director: null,
    actors: null,
    metascore: null,
    rt_rating: null,
    imdb_rating: null,
    imdb_votes: null,
    production_countries: [],
    rated: null,
    language: null,
    collection: null,
    ...over,
  };
}

function watch(over: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const date = over.date ?? "2024-05-01";
  return {
    date,
    tmdb_id: over.tmdb_id ?? 1,
    rating: 80,
    stars: 4,
    rewatch: false,
    liked: true,
    film: film(),
    d: new Date(`${date}T00:00:00Z`),
    yearFrac: 0.5,
    ...over,
  };
}

describe("hasKnownLike", () => {
  it("treats NULL as unknown, not as unliked", () => {
    expect(hasKnownLike(watch({ liked: null }))).toBe(false);
    expect(hasKnownLike(watch({ liked: false }))).toBe(true);
    expect(hasKnownLike(watch({ liked: true }))).toBe(true);
  });
});

describe("likedRate", () => {
  it("divides by the watches that RECORDED a heart, never by all of them", () => {
    // Two hearts, two explicit misses, four sheet-era unknowns. The honest rate
    // is 2/4; counting the unknowns as misses gives 2/8 and halves it.
    const ws = [
      watch({ liked: true }),
      watch({ liked: true }),
      watch({ liked: false }),
      watch({ liked: false }),
      ...Array.from({ length: 4 }, () => watch({ liked: null })),
    ];
    expect(likedRate(ws)).toEqual({ liked: 2, n: 4, rate: 0.5 });
  });

  it("reports zero rather than dividing by zero on an all-unknown group", () => {
    const r = likedRate([watch({ liked: null }), watch({ liked: null })]);
    expect(r).toEqual({ liked: 0, n: 0, rate: 0 });
  });

  it("filters unknowns itself, so a caller that forgot still gets it right", () => {
    expect(likedRate([watch({ liked: null })]).n).toBe(0);
  });
});

describe("knownWatches", () => {
  it("keeps explicit false and drops only null", () => {
    const ws = [watch({ liked: false }), watch({ liked: null }), watch({ liked: true })];
    expect(knownWatches(ws)).toHaveLength(2);
  });
});

describe("starBinIndex", () => {
  it("maps each rating to its exact half star", () => {
    expect(STAR_BINS[starBinIndex(20)]).toBe(1);
    expect(STAR_BINS[starBinIndex(70)]).toBe(3.5);
    expect(STAR_BINS[starBinIndex(80)]).toBe(4);
    expect(STAR_BINS[starBinIndex(90)]).toBe(4.5);
    expect(STAR_BINS[starBinIndex(100)]).toBe(5);
  });

  it("keeps 4.5 and 5 stars apart", () => {
    // The old "90+" band merged them. They are 97% and 100% hearted, and they
    // are the two ends of the curve most worth telling apart.
    expect(starBinIndex(90)).not.toBe(starBinIndex(100));
  });

  it("rounds an off-scale rating into its closest bin instead of dropping it", () => {
    expect(STAR_BINS[starBinIndex(77)]).toBe(4);
    expect(STAR_BINS[starBinIndex(73)]).toBe(3.5);
  });

  it("returns -1 below the scale rather than pinning to the first bin", () => {
    expect(starBinIndex(0)).toBe(-1);
  });
});

describe("starLabel", () => {
  it("uses the house rating label, matching the RatingsByGenre axis", () => {
    expect(starLabel(3.5)).toBe("3.5★");
    expect(starLabel(4)).toBe("4★");
  });
});

describe("byStarBin", () => {
  it("returns one bucket per bin even when a bin is empty", () => {
    const out = byStarBin([watch({ rating: 80 })]);
    expect(out).toHaveLength(STAR_BINS.length);
    expect(out.filter((g) => g.length).length).toBe(1);
    expect(out[STAR_BINS.indexOf(4)]).toHaveLength(1);
  });

  it("drops unknown-like and unrated watches", () => {
    const out = byStarBin([
      watch({ rating: 80, liked: null }),
      watch({ rating: null }),
      watch({ rating: 80 }),
    ]);
    expect(out.reduce((s, g) => s + g.length, 0)).toBe(1);
  });

  it("puts the crossover stars in adjacent bins", () => {
    const lo = STAR_BINS.indexOf(CROSSOVER_STARS[0]);
    const hi = STAR_BINS.indexOf(CROSSOVER_STARS[1]);
    expect(hi - lo).toBe(1);
  });
});

describe("crossoverWatches", () => {
  it("keeps only the band where the heart is genuinely in question", () => {
    const ws = [
      watch({ rating: 69 }),
      watch({ rating: 70 }),
      watch({ rating: 89 }),
      watch({ rating: 90 }),
    ];
    expect(crossoverWatches(ws).map((w) => w.rating)).toEqual([70, 89]);
  });

  it("excludes sheet-era rows even when their rating is in range", () => {
    expect(crossoverWatches([watch({ rating: 75, liked: null })])).toHaveLength(0);
  });
});

describe("runtimeBandIndex", () => {
  it("has no gap between bands and an open top", () => {
    expect(RUNTIME_BANDS[runtimeBandIndex(89)].label).toBe("<90");
    expect(RUNTIME_BANDS[runtimeBandIndex(90)].label).toBe("90-104");
    expect(RUNTIME_BANDS[runtimeBandIndex(139)].label).toBe("120-139");
    expect(RUNTIME_BANDS[runtimeBandIndex(240)].label).toBe("140+");
  });
});

describe("byRuntimeBand", () => {
  it("skips films with no runtime rather than bucketing them at zero", () => {
    const out = byRuntimeBand([
      watch({ film: film({ runtime: null }) }),
      watch({ film: film({ runtime: 95 }) }),
    ]);
    expect(out.reduce((s, g) => s + g.length, 0)).toBe(1);
    expect(out[1]).toHaveLength(1);
  });
});

describe("byRewatch", () => {
  it("splits first from rewatch, having already dropped the sheet era", () => {
    // The 129 sheet-era rows carry rewatch:false because the sheet had no such
    // column. They must not land in the "first" bucket and inflate it.
    const [first, again] = byRewatch([
      watch({ rewatch: false }),
      watch({ rewatch: true }),
      watch({ rewatch: false, liked: null }),
    ]);
    expect(first).toHaveLength(1);
    expect(again).toHaveLength(1);
  });
});

describe("admiredNotLoved", () => {
  it("finds high ratings without the heart, and nothing else", () => {
    const out = admiredNotLoved([
      watch({ tmdb_id: 1, rating: 90, liked: false, film: film({ title: "Cold" }) }),
      watch({ tmdb_id: 2, rating: 90, liked: true, film: film({ title: "Loved" }) }),
      watch({ tmdb_id: 3, rating: 60, liked: false, film: film({ title: "Low" }) }),
    ]);
    expect(out.map((f) => f.title)).toEqual(["Cold"]);
  });

  it("collapses a rewatched film to one row, keeping its highest rating", () => {
    const out = admiredNotLoved([
      watch({ tmdb_id: 7, rating: 80, liked: false, date: "2021-01-01" }),
      watch({ tmdb_id: 7, rating: 90, liked: false, date: "2023-01-01" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rating).toBe(90);
    expect(out[0].watches).toHaveLength(2);
  });

  it("sorts by rating, then by title so the order is stable", () => {
    const out = admiredNotLoved([
      watch({ tmdb_id: 1, rating: 80, liked: false, film: film({ title: "Beta" }) }),
      watch({ tmdb_id: 2, rating: 90, liked: false, film: film({ title: "Zed" }) }),
      watch({ tmdb_id: 3, rating: 80, liked: false, film: film({ title: "Alpha" }) }),
    ]);
    expect(out.map((f) => f.title)).toEqual(["Zed", "Alpha", "Beta"]);
  });

  it("excludes unknown-like rows, which are not evidence of not loving it", () => {
    expect(admiredNotLoved([watch({ rating: 95, liked: null })])).toHaveLength(0);
  });
});

describe("lovedNotAdmired", () => {
  it("counts films, not watches, so a rewatched favorite counts once", () => {
    const ws = [
      watch({ tmdb_id: 5, rating: 60, liked: true, date: "2021-01-01" }),
      watch({ tmdb_id: 5, rating: 60, liked: true, date: "2023-01-01" }),
    ];
    expect(lovedNotAdmired(ws)).toBe(1);
  });

  it("is the mirror of admiredNotLoved, not a second copy of it", () => {
    const ws = [
      watch({ tmdb_id: 1, rating: 90, liked: false }),
      watch({ tmdb_id: 2, rating: 60, liked: true }),
    ];
    expect(admiredNotLoved(ws)).toHaveLength(1);
    expect(lovedNotAdmired(ws)).toBe(1);
  });

  it("ignores unknown-like rows", () => {
    expect(lovedNotAdmired([watch({ rating: 50, liked: null })])).toBe(0);
  });
});

describe("likedByWatchYear", () => {
  it("takes the year off the string, so January 1 stays in its own year", () => {
    const out = likedByWatchYear([watch({ date: "2024-01-01" })], 1);
    expect(out.map((r) => r.year)).toEqual([2024]);
  });

  it("drops years too thin to rate", () => {
    const ws = [
      ...Array.from({ length: 12 }, () => watch({ date: "2023-05-01" })),
      watch({ date: "2019-05-01" }),
    ];
    expect(likedByWatchYear(ws).map((r) => r.year)).toEqual([2023]);
  });

  it("returns years in chronological order", () => {
    const ws = [
      ...Array.from({ length: 10 }, () => watch({ date: "2025-05-01" })),
      ...Array.from({ length: 10 }, () => watch({ date: "2021-05-01" })),
    ];
    expect(likedByWatchYear(ws).map((r) => r.year)).toEqual([2021, 2025]);
  });
});
