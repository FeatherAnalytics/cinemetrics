import { describe, it, expect } from "vitest";
import {
  ceilingFilms,
  FAV_IDS,
  favDirectorCohorts,
  favPosterPath,
  FOUR_FAVS,
  isFav,
  posterUrl,
} from "../fourFavs";
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
    director: "A Director",
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
    ...over,
  };
}

function watch(over: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const date = over.date ?? "2022-01-01";
  const w = {
    date,
    tmdb_id: 1,
    rating: 80,
    stars: 4,
    rewatch: false,
    liked: true,
    film: film(),
    d: new Date(date),
    yearFrac: 0,
    ...over,
  };
  // Mirrors the RESOLVED liked, not the override: these fixtures default liked to
  // true, and reading `over.liked` alone left heart null on every case that did not
  // name it. A case can still set heart explicitly to test the recovery.
  return { ...w, heart: over.heart !== undefined ? over.heart : w.liked };
}

/**
 * A watch of a film, wired so tmdb_id agrees on the watch and the film.
 *
 * `film` is a PARTIAL here rather than a whole one: every case below cares about
 * a title or a director and nothing else, and spelling out twenty fields to set
 * one is how a fixture stops being read.
 */
function of(
  tmdb_id: number,
  over: Omit<Partial<EnrichedWatch>, "film"> & { film?: Partial<Film> } = {},
): EnrichedWatch {
  const { film: over_film, ...rest } = over;
  return watch({
    tmdb_id,
    ...rest,
    film: film({ tmdb_id, ...(over_film ?? {}) }),
  });
}

const RAW = FOUR_FAVS[0].tmdb_id;
const SUSPIRIA = FOUR_FAVS[1].tmdb_id;

describe("isFav", () => {
  it("matches the curated ids and nothing else", () => {
    expect(isFav(RAW)).toBe(true);
    expect(isFav(999999)).toBe(false);
  });

  it("covers all four, so a chart cannot silently mark three", () => {
    expect(FAV_IDS.size).toBe(4);
    for (const f of FOUR_FAVS) expect(isFav(f.tmdb_id)).toBe(true);
  });
});

describe("posterUrl", () => {
  it("returns null for a film with no poster", () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl(undefined)).toBeNull();
  });

  it("builds a TMDB CDN url from a path", () => {
    expect(posterUrl("/abc123.jpg")).toContain("/abc123.jpg");
  });
});

describe("favPosterPath", () => {
  it("prefers the curated alternate art for the two films that have one", () => {
    // Suspiria and Raw are pinned to non-default TMDB art on purpose. A previous
    // refactor deleted these as redundant; they are not.
    expect(favPosterPath(361292, "/tmdb-default.jpg")).toBe(
      "/uaZSq2EdzNLwGS2Cba5VfespvyM.jpg",
    );
    expect(favPosterPath(393519, "/tmdb-default.jpg")).toBe(
      "/6kXW9b1FZXvB3l0mLMDbKwGgL3P.jpg",
    );
  });

  it("falls back to the film's own poster when there is no curated choice", () => {
    expect(favPosterPath(4977, "/tmdb-default.jpg")).toBe("/tmdb-default.jpg");
  });

  it("returns null when there is neither a curated choice nor a poster", () => {
    expect(favPosterPath(4977, null)).toBeNull();
  });
});

describe("ceilingFilms", () => {
  it("takes the top rating present rather than a hardcoded 100", () => {
    const out = ceilingFilms([
      of(1, { rating: 90, film: { title: "Best" } }),
      of(2, { rating: 70, film: { title: "Lower" } }),
    ]);
    expect(out.rating).toBe(90);
    expect(out.films.map((f) => f.label)).toEqual(["Best"]);
  });

  it("orders by watch count, so the rewatch theory can be read off it", () => {
    const out = ceilingFilms([
      of(1, { rating: 100, film: { title: "Once" } }),
      of(2, { rating: 100, film: { title: "Twice" }, date: "2022-01-01" }),
      of(2, { rating: 100, film: { title: "Twice" }, date: "2023-01-01" }),
    ]);
    expect(out.films.map((f) => f.label)).toEqual(["Twice", "Once"]);
  });

  it("breaks a count tie by label so the order never shuffles between renders", () => {
    const out = ceilingFilms([
      of(1, { rating: 100, film: { title: "Zed" } }),
      of(2, { rating: 100, film: { title: "Alpha" } }),
    ]);
    expect(out.films.map((f) => f.label)).toEqual(["Alpha", "Zed"]);
  });

  it("rates a film by its BEST watch, not its latest", () => {
    const out = ceilingFilms([
      of(1, { rating: 100, date: "2021-01-01", film: { title: "Peaked" } }),
      of(1, { rating: 60, date: "2023-01-01", film: { title: "Peaked" } }),
      of(2, { rating: 90, film: { title: "Steady" } }),
    ]);
    expect(out.rating).toBe(100);
    expect(out.films.map((f) => f.label)).toEqual(["Peaked"]);
  });

  it("flags the favorites by id, never by title", () => {
    // Both Suspirias at the ceiling: only the 2018 id is a favorite, and a title
    // match would hand the crimson to both.
    const out = ceilingFilms([
      of(SUSPIRIA, { rating: 100, film: { title: "Suspiria", year: 2018 } }),
      of(555, { rating: 100, film: { title: "Suspiria", year: 1977 } }),
    ]);
    expect(out.films.filter((f) => f.fav).map((f) => f.label)).toEqual([
      "Suspiria (2018)",
    ]);
  });

  it("adds the year only to the titles that collide", () => {
    const out = ceilingFilms([
      of(SUSPIRIA, { rating: 100, film: { title: "Suspiria", year: 2018 } }),
      of(555, { rating: 100, film: { title: "Suspiria", year: 1977 } }),
      of(777, { rating: 100, film: { title: "Raw", year: 2016 } }),
    ]);
    expect(out.films.map((f) => f.label).sort()).toEqual([
      "Raw",
      "Suspiria (1977)",
      "Suspiria (2018)",
    ]);
  });

  it("ignores unrated watches instead of bucketing them at zero", () => {
    const out = ceilingFilms([
      of(1, { rating: null, film: { title: "Unrated" } }),
      of(2, { rating: 50, film: { title: "Rated" } }),
    ]);
    expect(out.rating).toBe(50);
    expect(out.films.map((f) => f.label)).toEqual(["Rated"]);
  });

  it("returns an empty ceiling when nothing in view is rated", () => {
    expect(ceilingFilms([of(1, { rating: null })])).toEqual({ rating: null, films: [] });
    expect(ceilingFilms([])).toEqual({ rating: null, films: [] });
  });
});

describe("favDirectorCohorts", () => {
  it("groups a favorite with the rest of its director's watched work", () => {
    const out = favDirectorCohorts([
      of(RAW, { rating: 100, film: { title: "Raw", director: "Ducournau" } }),
      of(2, { rating: 90, film: { title: "Titane", director: "Ducournau" } }),
      of(3, { rating: 70, film: { title: "Elsewhere", director: "Someone Else" } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].director).toBe("Ducournau");
    expect(out[0].fav.title).toBe("Raw");
    expect(out[0].others.map((f) => f.title)).toEqual(["Titane"]);
  });

  it("admits more than one companion, so a new watch does not break the shape", () => {
    const out = favDirectorCohorts([
      of(RAW, { rating: 100, film: { director: "D" } }),
      of(2, { rating: 90, film: { title: "Second", director: "D" } }),
      of(3, { rating: 95, film: { title: "Third", director: "D" } }),
    ]);
    expect(out[0].others.map((f) => f.title)).toEqual(["Third", "Second"]);
  });

  it("skips a favorite that is not in view", () => {
    const out = favDirectorCohorts([of(3, { film: { director: "Someone Else" } })]);
    expect(out).toEqual([]);
  });

  it("drops a favorite with no director rather than grouping under a null key", () => {
    const out = favDirectorCohorts([
      of(RAW, { film: { director: null } }),
      of(2, { film: { director: null } }),
    ]);
    expect(out).toEqual([]);
  });

  it("collapses a rewatched favorite to one row, keeping every watch", () => {
    const out = favDirectorCohorts([
      of(RAW, { rating: 90, date: "2021-01-01", film: { director: "D" } }),
      of(RAW, { rating: 100, date: "2023-01-01", film: { director: "D" } }),
    ]);
    expect(out[0].fav.watches).toHaveLength(2);
    expect(out[0].fav.rating).toBe(100);
  });

  it("keeps the curated order, not an order derived from the ratings", () => {
    const out = favDirectorCohorts([
      of(SUSPIRIA, { rating: 100, film: { director: "G" } }),
      of(RAW, { rating: 100, film: { director: "D" } }),
    ]);
    expect(out.map((c) => c.director)).toEqual(["D", "G"]);
  });
});
