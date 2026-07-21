import { describe, it, expect } from "vitest";
import { filterWatches, getStoryById, type Filters } from "../store";
import { watchKey } from "../brush";
import type { EnrichedWatch, Film } from "../types";
import type { GenreKey } from "../palette";

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    tmdb_id: 100,
    imdb_id: "tt0000001",
    title: "Test Film",
    year: 2020,
    genres: ["Drama"],
    keywords: [],
    runtime: 120,
    budget: null,
    revenue: null,
    director: "Jane Director",
    actors: "Alice Actor, Bob Actor",
    metascore: 75,
    rt_rating: 80,
    imdb_rating: 7.5,
    imdb_votes: null,
    production_countries: ["US"],
    rated: "R",
    language: "en",
    collection: null,
    ...overrides,
  };
}

function makeWatch(
  film: Film,
  overrides: Partial<EnrichedWatch> = {},
): EnrichedWatch {
  const d = new Date((overrides.date ?? "2023-06-15") + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return {
    date: "2023-06-15",
    tmdb_id: film.tmdb_id,
    rating: 70,
    stars: 3.5,
    rewatch: false,
    film,
    d,
    yearFrac: (d.getTime() - start) / (end - start),
    ...overrides,
  };
}

const EMPTY: Filters = {
  genres: new Set<GenreKey>(),
  yearRange: null,
  releaseYearRange: null,
  rewatch: "all",
  title: "",
  director: "",
  actor: "",
  country: null,
  selection: null,
};

describe("filterWatches", () => {
  const drama = makeFilm({ tmdb_id: 1, title: "Drama Film", genres: ["Drama"], production_countries: ["US"] });
  const horror = makeFilm({ tmdb_id: 2, title: "Horror Film", genres: ["Horror"], production_countries: ["IT", "US"] });
  const comedy = makeFilm({
    tmdb_id: 3,
    title: "Comedy Film",
    genres: ["Comedy"],
    year: 1995,
    director: "Mel Brooks",
    actors: "Gene Wilder",
    production_countries: ["GB"],
  });

  const w1 = makeWatch(drama, { date: "2023-03-01", tmdb_id: 1 });
  const w2 = makeWatch(horror, { date: "2024-07-15", tmdb_id: 2 });
  const w3 = makeWatch(comedy, { date: "2023-11-20", tmdb_id: 3, rewatch: true });

  const all = [w1, w2, w3];

  it("returns all watches when filters are empty", () => {
    expect(filterWatches(all, EMPTY)).toHaveLength(3);
  });

  it("filters by genre", () => {
    const filters: Filters = { ...EMPTY, genres: new Set<GenreKey>(["Horror"]) };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Horror Film");
  });

  it("filters by year range", () => {
    const filters: Filters = { ...EMPTY, yearRange: [2024, 2024] };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Horror Film");
  });

  it("restricts to a brushed selection of watch keys", () => {
    const filters: Filters = { ...EMPTY, selection: new Set([watchKey(w1), watchKey(w3)]) };
    const result = filterWatches(all, filters);
    expect(result.map((w) => w.film?.title).sort()).toEqual(["Comedy Film", "Drama Film"]);
  });

  it("filters by release year range", () => {
    const filters: Filters = { ...EMPTY, releaseYearRange: [1990, 2000] };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Comedy Film");
  });

  it("filters rewatch=first excludes rewatches", () => {
    const filters: Filters = { ...EMPTY, rewatch: "first" };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(2);
    expect(result.every((w) => !w.rewatch)).toBe(true);
  });

  it("filters rewatch=rewatch excludes first watches", () => {
    const filters: Filters = { ...EMPTY, rewatch: "rewatch" };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].rewatch).toBe(true);
  });

  it("filters by title substring", () => {
    const filters: Filters = { ...EMPTY, title: "horror" };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Horror Film");
  });

  it("filters by director substring", () => {
    const filters: Filters = { ...EMPTY, director: "brooks" };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Comedy Film");
  });

  it("filters by actor substring", () => {
    const filters: Filters = { ...EMPTY, actor: "wilder" };
    const result = filterWatches(all, filters);
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Comedy Film");
  });

  it("filters by production country (matches any of a film's countries)", () => {
    const us = filterWatches(all, { ...EMPTY, country: "US" });
    expect(us.map((w) => w.film?.title).sort()).toEqual(["Drama Film", "Horror Film"]);
    const it_ = filterWatches(all, { ...EMPTY, country: "IT" });
    expect(it_).toHaveLength(1);
    expect(it_[0].film?.title).toBe("Horror Film");
  });

  it("combines multiple filters", () => {
    const filters: Filters = {
      ...EMPTY,
      yearRange: [2023, 2023],
      rewatch: "first",
    };
    const result = filterWatches(all, filters);
    // 2023 watches: w1 (first) and w3 (rewatch). "first" excludes w3.
    expect(result).toHaveLength(1);
    expect(result[0].film?.title).toBe("Drama Film");
  });
});

describe("getStoryById", () => {
  it("returns a story config for a valid id", () => {
    const story = getStoryById("spooktober");
    expect(story).toBeDefined();
    expect(story!.id).toBe("spooktober");
  });

  it("returns undefined for an invalid id", () => {
    expect(getStoryById("nonexistent")).toBeUndefined();
  });
});
