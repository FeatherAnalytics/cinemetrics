import { describe, it, expect } from "vitest";
import { STORIES } from "../stories";
import type { EnrichedWatch, Film } from "../types";

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    tmdb_id: 100, imdb_id: "tt0000001", title: "Test", year: 2020,
    genres: ["Drama"], keywords: [], runtime: 120, budget: null,
    revenue: null, director: null, actors: null, metascore: 75,
    rt_rating: 80, imdb_rating: 70, imdb_votes: 50000,
    production_countries: [], rated: null, language: null, collection: null,
    ...overrides,
  };
}

function makeWatch(film: Film, overrides: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const date = overrides.date ?? "2023-06-15";
  const d = new Date(date + "T00:00:00Z");
  return {
    date, tmdb_id: film.tmdb_id, rating: 70, stars: 3.5,
    rewatch: false, film, d, yearFrac: 0.45, ...overrides,
  };
}

const spooktober = STORIES.find((s) => s.id === "spooktober")!;
const ratingDrift = STORIES.find((s) => s.id === "rating-drift")!;
const hiddenGems = STORIES.find((s) => s.id === "hidden-gems")!;
const genreContrarian = STORIES.find((s) => s.id === "genre-contrarian")!;

describe("spooktober", () => {
  it("counts Horror watches in October and finds peak year", () => {
    const horror = makeFilm({ tmdb_id: 1, genres: ["Horror"] });
    const drama = makeFilm({ tmdb_id: 2, genres: ["Drama"] });
    const watches = [
      makeWatch(horror, { tmdb_id: 1, date: "2023-10-01" }),
      makeWatch(horror, { tmdb_id: 1, date: "2023-10-15" }),
      makeWatch(horror, { tmdb_id: 1, date: "2024-10-05" }),
      makeWatch(drama, { tmdb_id: 2, date: "2023-10-20" }),
      makeWatch(horror, { tmdb_id: 1, date: "2023-06-01" }),
    ];
    const result = spooktober.compute([horror, drama], watches);
    expect(result.headline).toContain("2023");
    expect(result.headline).toContain("2");
    expect(result.filters?.genres).toBeDefined();
  });
});

describe("rating-drift", () => {
  it("finds film with biggest rating change on rewatch", () => {
    const film = makeFilm({ tmdb_id: 1, title: "Drifter" });
    const watches = [
      makeWatch(film, { tmdb_id: 1, date: "2022-01-01", rating: 50, rewatch: false }),
      makeWatch(film, { tmdb_id: 1, date: "2023-06-01", rating: 80, rewatch: true }),
    ];
    const result = ratingDrift.compute([film], watches);
    expect(result.headline).toContain("Drifter");
    expect(result.headline).toContain("30");
    expect(result.selection).toBeDefined();
    expect(result.selection!.size).toBeGreaterThan(0);
  });
});

describe("hidden-gems", () => {
  it("finds high-rated films with low IMDB votes", () => {
    const gem = makeFilm({ tmdb_id: 1, title: "Hidden One", imdb_votes: 500 });
    const popular = makeFilm({ tmdb_id: 2, title: "Popular", imdb_votes: 200000 });
    const watches = [
      makeWatch(gem, { tmdb_id: 1, rating: 90 }),
      makeWatch(popular, { tmdb_id: 2, rating: 90 }),
    ];
    const result = hiddenGems.compute([gem, popular], watches);
    expect(result.headline).toContain("Hidden One");
    expect(result.selection).toBeDefined();
    expect(result.selection!.size).toBe(1);
  });

  it("returns fallback when no gems found", () => {
    const popular = makeFilm({ tmdb_id: 1, imdb_votes: 200000 });
    const watches = [makeWatch(popular, { tmdb_id: 1, rating: 90 })];
    const result = hiddenGems.compute([popular], watches);
    expect(result.headline).toBeTruthy();
  });
});

describe("genre-contrarian", () => {
  it("finds genre with biggest rating delta from critics", () => {
    const horror1 = makeFilm({ tmdb_id: 1, genres: ["Horror"], metascore: 40 });
    const horror2 = makeFilm({ tmdb_id: 2, genres: ["Horror"], metascore: 45 });
    const drama1 = makeFilm({ tmdb_id: 3, genres: ["Drama"], metascore: 70 });
    const watches = [
      makeWatch(horror1, { tmdb_id: 1, rating: 80 }),
      makeWatch(horror2, { tmdb_id: 2, rating: 85 }),
      makeWatch(drama1, { tmdb_id: 3, rating: 72 }),
    ];
    const result = genreContrarian.compute([horror1, horror2, drama1], watches);
    expect(result.headline).toContain("Horror");
    expect(result.headline).toMatch(/above/);
    expect(result.filters?.genres).toBeDefined();
  });
});
