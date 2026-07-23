import { describe, it, expect } from "vitest";
import { aggregateCountries } from "../countryStats";
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

function byIdOf(films: Film[]): Map<number, Film> {
  return new Map(films.map((f) => [f.tmdb_id, f]));
}

describe("aggregateCountries", () => {
  it("returns empty aggregate for no watches", () => {
    const agg = aggregateCountries([], new Map());
    expect(agg.rows).toEqual([]);
    expect(agg.totalCountries).toBe(0);
  });

  it("counts distinct films per country, not watches", () => {
    const f = makeFilm({ tmdb_id: 1, production_countries: ["US"] });
    const watches = [makeWatch(f), makeWatch(f, { rewatch: true })];
    const agg = aggregateCountries(watches, byIdOf([f]));
    expect(agg.rows).toHaveLength(1);
    expect(agg.rows[0].iso).toBe("US");
    expect(agg.rows[0].count).toBe(1);
  });

  it("counts co-productions under every country", () => {
    const f = makeFilm({ tmdb_id: 1, production_countries: ["US", "GB"] });
    const agg = aggregateCountries([makeWatch(f)], byIdOf([f]));
    expect(agg.rows.map((r) => r.iso).sort()).toEqual(["GB", "US"]);
  });

  it("ranks by count descending with iso tiebreak", () => {
    const us1 = makeFilm({ tmdb_id: 1, production_countries: ["US"] });
    const us2 = makeFilm({ tmdb_id: 2, production_countries: ["US"] });
    const jp = makeFilm({ tmdb_id: 3, production_countries: ["JP"] });
    const fr = makeFilm({ tmdb_id: 4, production_countries: ["FR"] });
    const watches = [us1, us2, jp, fr].map((f) => makeWatch(f));
    const agg = aggregateCountries(watches, byIdOf([us1, us2, jp, fr]));
    expect(agg.rows.map((r) => r.iso)).toEqual(["US", "FR", "JP"]);
  });

  it("picks the dominant genre with GENRE_ORDER tiebreak", () => {
    const horror = makeFilm({ tmdb_id: 1, genres: ["Horror"], production_countries: ["US"] });
    const drama = makeFilm({ tmdb_id: 2, genres: ["Drama"], production_countries: ["US"] });
    const agg = aggregateCountries([makeWatch(horror), makeWatch(drama)], byIdOf([horror, drama]));
    // 1-1 tie: Horror comes first in GENRE_ORDER.
    expect(agg.rows[0].genre).toBe("Horror");
  });

  it("hides the residual below the minimum film count", () => {
    const films = Array.from({ length: 6 }, (_, i) =>
      makeFilm({
        tmdb_id: i + 1,
        production_countries: ["US"],
        metascore: 50 + i * 5,
        rt_rating: 50 + i * 5,
        imdb_rating: 5 + i * 0.5,
      }),
    );
    const watches = films.map((f, i) => makeWatch(f, { rating: 50 + i * 10 }));
    const agg = aggregateCountries(watches, byIdOf(films));
    // 6 films with full critic data -> residuals exist and n >= 5.
    expect(agg.rows[0].residualN).toBe(6);
    expect(agg.rows[0].residual).not.toBeNull();

    // Same films but only 4 have critic data -> below RESIDUAL_MIN_N, hidden.
    const sparse = films.map((f, i) => (i < 2 ? makeFilm({ ...f, metascore: null }) : f));
    const sparseWatches = sparse.map((f, i) => makeWatch(f, { rating: 50 + i * 10 }));
    const agg2 = aggregateCountries(sparseWatches, byIdOf(sparse));
    expect(agg2.rows[0].residual).toBeNull();
  });

  it("splits top rows from the tail and dedupes tail films", () => {
    const films: Film[] = [];
    const watches: EnrichedWatch[] = [];
    // 3 countries with descending counts: AA x3, BB x2, CC x1
    let id = 1;
    for (const [iso, n] of [["AA", 3], ["BB", 2], ["CC", 1]] as const) {
      for (let i = 0; i < n; i++) {
        const f = makeFilm({ tmdb_id: id++, production_countries: [iso] });
        films.push(f);
        watches.push(makeWatch(f));
      }
    }
    // A co-production already counted under AA must not inflate the tail.
    const co = makeFilm({ tmdb_id: id++, production_countries: ["AA", "CC"] });
    films.push(co);
    watches.push(makeWatch(co));

    const agg = aggregateCountries(watches, byIdOf(films), 2);
    expect(agg.rows.map((r) => r.iso)).toEqual(["AA", "BB"]);
    expect(agg.totalCountries).toBe(3);
    expect(agg.tailCountries).toBe(1);
    // CC has 2 films, but the co-production is already in AA's top row.
    expect(agg.tailFilms).toBe(1);
  });
});
