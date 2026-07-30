import { describe, it, expect } from "vitest";
import {
  byStarBin,
  filmHearts,
  ratingsByStarBin,
  CROSSOVER_STARS,
  crossoverWatches,
  hasKnownLike,
  knownWatches,
  likedRate,
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
    poster: null,
    slice: null,
    ...over,
  };
}

function watch(over: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const date = over.date ?? "2024-05-01";
  const w = {
    date,
    tmdb_id: over.tmdb_id ?? 1,
    rating: 80,
    stars: 4,
    rewatch: false, returned: false,
    liked: true,
    film: film(),
    d: new Date(`${date}T00:00:00Z`),
    yearFrac: 0.5,
    ...over,
  };
  // Mirrors the RESOLVED liked, not the override: these fixtures default liked to
  // true, and reading `over.liked` alone left heart null on every case that did not
  // name it. A case can still set heart explicitly to test the recovery.
  return { ...w, heart: over.heart !== undefined ? over.heart : w.liked };
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

describe("filmHearts", () => {
  it("carries a recorded heart to the film's other watches", () => {
    const hearts = filmHearts([
      { date: "2019-03-01", tmdb_id: 7, rating: 100, stars: 5, rewatch: false, returned: false, liked: null },
      { date: "2021-03-01", tmdb_id: 7, rating: 100, stars: 5, rewatch: true, returned: false, liked: true },
    ]);
    expect(hearts.get(7)).toBe(true);
  });

  it("carries a false heart too, which is evidence and not an absence", () => {
    const hearts = filmHearts([
      { date: "2019-03-01", tmdb_id: 8, rating: 90, stars: 4.5, rewatch: false, returned: false, liked: null },
      { date: "2021-03-01", tmdb_id: 8, rating: 90, stars: 4.5, rewatch: true, returned: false, liked: false },
    ]);
    expect(hearts.get(8)).toBe(false);
  });

  it("leaves a film with no recorded heart out of the map entirely", () => {
    const hearts = filmHearts([
      { date: "2019-03-01", tmdb_id: 9, rating: 70, stars: 3.5, rewatch: false, returned: false, liked: null },
    ]);
    expect(hearts.has(9)).toBe(false);
  });

  it("keys on tmdb_id, so two films sharing a title do not share a heart", () => {
    // The library holds a hearted Suspiria (2018) and an unhearted one (1977).
    const hearts = filmHearts([
      { date: "2020-08-15", tmdb_id: 361292, rating: 100, stars: 5, rewatch: false, returned: false, liked: true },
      { date: "2020-10-31", tmdb_id: 555, rating: 90, stars: 4.5, rewatch: false, returned: false, liked: false },
    ]);
    expect(hearts.get(361292)).toBe(true);
    expect(hearts.get(555)).toBe(false);
  });
});

describe("likedRate reads the recovered heart", () => {
  it("counts a row whose heart came from another watch of the same film", () => {
    // The whole point of the recovery: this row recorded nothing, and is still
    // known, so it belongs in the denominator AND the numerator.
    const r = likedRate([watch({ tmdb_id: 7, liked: null, heart: true })]);
    expect(r).toEqual({ liked: 1, n: 1, rate: 1 });
  });

  it("still excludes a row whose film was never watched again", () => {
    expect(likedRate([watch({ liked: null, heart: null })])).toEqual({
      liked: 0,
      n: 0,
      rate: 0,
    });
  });
});

describe("ratingsByStarBin", () => {
  it("keeps watches whose heart was never recorded, unlike byStarBin", () => {
    // The distribution is about my ratings, so an unknown heart is irrelevant to
    // it. byStarBin drops these because the rates built on it cannot use them.
    const ws = [watch({ rating: 80, liked: null, heart: null })];
    expect(ratingsByStarBin(ws).flat()).toHaveLength(1);
    expect(byStarBin(ws).flat()).toHaveLength(0);
  });

  it("returns one bucket per bin, in scale order", () => {
    const out = ratingsByStarBin([watch({ rating: 20 }), watch({ rating: 100 })]);
    expect(out).toHaveLength(STAR_BINS.length);
    expect(out[STAR_BINS.indexOf(1)]).toHaveLength(1);
    expect(out[STAR_BINS.indexOf(5)]).toHaveLength(1);
  });

  it("counts watches, not films, so a rewatch votes twice", () => {
    const out = ratingsByStarBin([
      watch({ tmdb_id: 7, rating: 80, date: "2021-01-01" }),
      watch({ tmdb_id: 7, rating: 80, date: "2023-01-01" }),
    ]);
    expect(out[STAR_BINS.indexOf(4)]).toHaveLength(2);
  });

  it("drops unrated watches rather than bucketing them at one star", () => {
    expect(ratingsByStarBin([watch({ rating: null })]).flat()).toHaveLength(0);
  });
});
