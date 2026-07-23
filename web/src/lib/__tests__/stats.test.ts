import { describe, it, expect } from "vitest";
import { computeScreenTime, computeAvgRating, computeMedianRating, computeResiduals } from "../stats";
import type { EnrichedWatch, Film } from "../types";

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    tmdb_id: 100, imdb_id: "tt0000001", title: "Test", year: 2020,
    genres: ["Drama"], keywords: [], runtime: 120, budget: null,
    revenue: null, director: null, actors: null, metascore: null,
    rt_rating: null, imdb_rating: null, imdb_votes: null,
    production_countries: [], rated: null, language: null, collection: null,
    ...overrides,
  } as Film;
}

function makeWatch(film: Film, overrides: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const d = new Date("2023-06-15T00:00:00Z");
  return {
    date: "2023-06-15", tmdb_id: film.tmdb_id, rating: 70, stars: 3.5,
    rewatch: false, film, d, yearFrac: 0.45, ...overrides,
  };
}

describe("computeScreenTime", () => {
  it("sums runtime across watches including rewatches", () => {
    const f = makeFilm({ tmdb_id: 1, runtime: 120 });
    const watches = [
      makeWatch(f, { tmdb_id: 1 }),
      makeWatch(f, { tmdb_id: 1, rewatch: true }),
    ];
    expect(computeScreenTime(watches)).toBe(240);
  });

  it("returns 0 for empty watches", () => {
    expect(computeScreenTime([])).toBe(0);
  });

  it("skips films with null runtime", () => {
    const f = makeFilm({ tmdb_id: 1, runtime: null });
    expect(computeScreenTime([makeWatch(f, { tmdb_id: 1 })])).toBe(0);
  });
});

describe("computeAvgRating", () => {
  it("returns mean and CI for rated watches", () => {
    const f = makeFilm();
    const watches = [
      makeWatch(f, { rating: 60 }),
      makeWatch(f, { rating: 80 }),
      makeWatch(f, { rating: 70 }),
      makeWatch(f, { rating: 90 }),
    ];
    const result = computeAvgRating(watches);
    expect(result.mean).toBe(75);
    expect(result.ci).toBeGreaterThan(0);
    expect(result.n).toBe(4);
  });

  it("returns null for no rated watches", () => {
    const f = makeFilm();
    const watches = [makeWatch(f, { rating: null })];
    const result = computeAvgRating(watches);
    expect(result.mean).toBeNull();
    expect(result.ci).toBeNull();
  });
});

describe("computeMedianRating", () => {
  const f = makeFilm();

  it("returns the middle value for an odd count", () => {
    const watches = [30, 90, 60].map((rating) => makeWatch(f, { rating }));
    expect(computeMedianRating(watches)).toBe(60);
  });

  it("averages the two middle values for an even count", () => {
    const watches = [40, 60, 80, 100].map((rating) => makeWatch(f, { rating }));
    expect(computeMedianRating(watches)).toBe(70);
  });

  it("ignores unrated watches", () => {
    const watches = [
      makeWatch(f, { rating: 50 }),
      makeWatch(f, { rating: null }),
      makeWatch(f, { rating: 90 }),
      makeWatch(f, { rating: 70 }),
    ];
    expect(computeMedianRating(watches)).toBe(70);
  });

  it("returns null with no rated watches", () => {
    expect(computeMedianRating([makeWatch(f, { rating: null })])).toBeNull();
  });
});

describe("computeResiduals", () => {
  const filmA = makeFilm({ tmdb_id: 1, metascore: 80, rt_rating: 85, imdb_rating: 75 });
  const filmB = makeFilm({ tmdb_id: 2, metascore: 40, rt_rating: 50, imdb_rating: 55 });
  const filmC = makeFilm({ tmdb_id: 3, metascore: 60, rt_rating: 65, imdb_rating: 60 });
  const filmD = makeFilm({ tmdb_id: 4, metascore: 70, rt_rating: 75, imdb_rating: 70 });
  const filmE = makeFilm({ tmdb_id: 5, metascore: 50, rt_rating: 55, imdb_rating: 50 });

  const byId = new Map<number, Film>([
    [1, filmA], [2, filmB], [3, filmC], [4, filmD], [5, filmE],
  ]);

  const watches = [
    makeWatch(filmA, { tmdb_id: 1, rating: 90 }),
    makeWatch(filmB, { tmdb_id: 2, rating: 30 }),
    makeWatch(filmC, { tmdb_id: 3, rating: 70 }),
    makeWatch(filmD, { tmdb_id: 4, rating: 75 }),
    makeWatch(filmE, { tmdb_id: 5, rating: 60 }),
  ];

  it("returns one FilmResidual per film with all 3 critic scores", () => {
    const result = computeResiduals(watches, byId);
    expect(result.films).toHaveLength(5);
    expect(result.films[0]).toHaveProperty("tmdb_id");
    expect(result.films[0]).toHaveProperty("me");
    expect(result.films[0]).toHaveProperty("predicted");
    expect(result.films[0]).toHaveProperty("residual");
    expect(result.films[0]).toHaveProperty("metascore");
    expect(result.films[0]).toHaveProperty("rt_rating");
    expect(result.films[0]).toHaveProperty("imdb_rating");
  });

  it("residual equals me minus predicted", () => {
    const result = computeResiduals(watches, byId);
    for (const f of result.films) {
      expect(f.residual).toBeCloseTo(f.me - f.predicted, 5);
    }
  });

  it("computes R² between 0 and 1", () => {
    const result = computeResiduals(watches, byId);
    expect(result.r2).toBeGreaterThanOrEqual(0);
    expect(result.r2).toBeLessThanOrEqual(1);
  });

  it("returns coefficients with intercept and 3 critic weights", () => {
    const result = computeResiduals(watches, byId);
    expect(result.coefficients).toHaveProperty("intercept");
    expect(result.coefficients).toHaveProperty("metascore");
    expect(result.coefficients).toHaveProperty("rt");
    expect(result.coefficients).toHaveProperty("imdb");
  });

  it("excludes films missing any critic score", () => {
    const partial = makeFilm({ tmdb_id: 6, metascore: 50, rt_rating: null, imdb_rating: 60 });
    const extById = new Map(byId);
    extById.set(6, partial);
    const extWatches = [...watches, makeWatch(partial, { tmdb_id: 6, rating: 70 })];
    const result = computeResiduals(extWatches, extById);
    expect(result.films).toHaveLength(5);
    expect(result.films.find((f) => f.tmdb_id === 6)).toBeUndefined();
  });

  it("returns empty result for fewer than 5 films", () => {
    const few = watches.slice(0, 3);
    const result = computeResiduals(few, byId);
    expect(result.films).toHaveLength(0);
    expect(result.r2).toBe(0);
  });

  it("aggregates multiple watches per film to avg rating", () => {
    const extraWatch = makeWatch(filmA, { tmdb_id: 1, rating: 80, rewatch: true });
    const result = computeResiduals([...watches, extraWatch], byId);
    const filmAResult = result.films.find((f) => f.tmdb_id === 1)!;
    expect(filmAResult.me).toBe(85);
  });
});
