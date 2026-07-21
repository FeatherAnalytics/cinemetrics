import { describe, it, expect } from "vitest";
import type { Film, Watch, Dataset } from "../types";

describe("data type parsing", () => {
  const sampleFilm: Film = {
    tmdb_id: 550,
    imdb_id: "tt0137523",
    title: "Fight Club",
    year: 1999,
    genres: ["Drama", "Thriller"],
    keywords: ["twist ending"],
    runtime: 139,
    budget: 63000000,
    revenue: 101209702,
    director: "David Fincher",
    actors: "Brad Pitt, Edward Norton",
    metascore: 66,
    rt_rating: 79,
    imdb_rating: 8.8,
    imdb_votes: 2000000,
    production_countries: ["US", "DE"],
    rated: "R",
    language: "en",
    collection: null,
  };

  const sampleWatch: Watch = {
    date: "2023-04-12",
    tmdb_id: 550,
    rating: 85,
    stars: 4,
    rewatch: false,
  };

  it("Film satisfies type with all fields", () => {
    expect(sampleFilm.tmdb_id).toBe(550);
    expect(sampleFilm.imdb_id).toBe("tt0137523");
    expect(sampleFilm.title).toBe("Fight Club");
    expect(sampleFilm.genres).toContain("Drama");
  });

  it("Watch links to Film by tmdb_id", () => {
    expect(sampleWatch.tmdb_id).toBe(sampleFilm.tmdb_id);
  });

  it("films and watches link correctly in a dataset", () => {
    const dataset: Dataset = {
      films: [sampleFilm],
      watches: [sampleWatch],
    };
    const byId = new Map(dataset.films.map((f) => [f.tmdb_id, f]));
    const linked = byId.get(dataset.watches[0].tmdb_id);
    expect(linked).toBeDefined();
    expect(linked!.title).toBe("Fight Club");
  });

  it("handles null optional fields", () => {
    const sparse: Film = {
      tmdb_id: 999,
      imdb_id: "tt9999999",
      title: "Unknown Film",
      year: null,
      genres: [],
      keywords: [],
      runtime: null,
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
    };
    expect(sparse.director).toBeNull();
    expect(sparse.metascore).toBeNull();
    expect(sparse.year).toBeNull();
  });

  it("handles watch with null rating", () => {
    const w: Watch = {
      date: "2024-01-01",
      tmdb_id: 999,
      rating: null,
      stars: null,
      rewatch: true,
    };
    expect(w.rating).toBeNull();
    expect(w.stars).toBeNull();
  });

  it("unlinked watch returns undefined from map", () => {
    const dataset: Dataset = {
      films: [sampleFilm],
      watches: [{ date: "2024-01-01", tmdb_id: 99999, rating: 50, stars: 2.5, rewatch: false }],
    };
    const byId = new Map(dataset.films.map((f) => [f.tmdb_id, f]));
    expect(byId.get(dataset.watches[0].tmdb_id)).toBeUndefined();
  });
});
