import { describe, it, expect } from "vitest";
import {
  countryBars,
  decadeBars,
  genreBars,
  keywordBars,
  languageBars,
  rankMulti,
  watchlistSummary,
} from "../watchlistChart";
import { filterWatchlist, type Filters } from "../store";
import { GENRE_COLORS } from "../palette";
import type { WatchlistFilm } from "../types";

function film(over: Partial<WatchlistFilm> = {}): WatchlistFilm {
  return {
    tmdb_id: 1,
    title: "A Film",
    year: 2000,
    released: "2000-01-01",
    added: "2024-01-01",
    watched: false,
    genres: [],
    keywords: [],
    runtime: 100,
    production_countries: [],
    language: "en",
    director: null,
    imdb_rating: null,
    imdb_votes: null,
    ...over,
  };
}

const EMPTY: Filters = {
  genres: new Set(),
  yearRange: null,
  releaseYearRange: null,
  rewatch: "all",
  title: "",
  director: "",
  actor: "",
  country: null,
  language: null,
  rated: null,
  franchise: null,
  runtimeRange: null,
  ratingRange: null,
  votesRange: null,
  selection: null,
};

describe("rankMulti", () => {
  it("counts a film once per distinct value, not once per occurrence", () => {
    // TMDB has shipped duplicate entries in these arrays. The question the chart
    // asks is how many FILMS carry a value, so a repeat must not double it.
    const bars = rankMulti([film({ genres: ["Drama", "Drama"] })], (f) => f.genres);
    expect(bars).toHaveLength(1);
    expect(bars[0].count).toBe(1);
  });

  it("counts a multi-valued film into every one of its values", () => {
    const bars = rankMulti(
      [film({ genres: ["Drama", "Horror"] }), film({ genres: ["Drama"] })],
      (f) => f.genres,
    );
    expect(bars.map((b) => [b.key, b.count])).toEqual([
      ["Drama", 2],
      ["Horror", 1],
    ]);
  });

  it("breaks ties alphabetically so bar order does not reshuffle on an unrelated filter", () => {
    const bars = rankMulti(
      [film({ genres: ["Western", "Comedy", "Action"] })],
      (f) => f.genres,
    );
    expect(bars.map((b) => b.key)).toEqual(["Action", "Comedy", "Western"]);
  });

  it("drops empty and whitespace-only values rather than ranking a blank bar", () => {
    const bars = rankMulti([film({ genres: ["", "  ", "Drama"] })], (f) => f.genres);
    expect(bars.map((b) => b.key)).toEqual(["Drama"]);
  });

  it("honours minCount and limit", () => {
    const films = [
      film({ genres: ["A", "B"] }),
      film({ genres: ["A", "B"] }),
      film({ genres: ["A"] }),
    ];
    expect(rankMulti(films, (f) => f.genres, { minCount: 2 }).map((b) => b.key)).toEqual([
      "A",
      "B",
    ]);
    expect(rankMulti(films, (f) => f.genres, { minCount: 3 }).map((b) => b.key)).toEqual(["A"]);
    expect(rankMulti(films, (f) => f.genres, { limit: 1 })).toHaveLength(1);
  });

  it("returns no bars for an empty list rather than throwing", () => {
    expect(rankMulti([], (f) => f.genres)).toEqual([]);
  });
});

describe("genreBars", () => {
  it("gives a tracked genre its own identity colour rather than a dominant one", () => {
    // A genre row IS its category, so it keeps its own colour even though the
    // one film behind it is also a Horror film.
    const bars = genreBars([film({ genres: ["Horror", "Documentary"] })]);
    const byKey = new Map(bars.map((b) => [b.key, b.color]));
    expect(byKey.get("Horror")).toBe(GENRE_COLORS.Horror);
  });

  it("never paints an untracked genre in another genre's colour", () => {
    // Most Mystery and Science Fiction films on the list are also horror, and
    // primaryGenre resolves Horror first — so a dominant-genre rule painted
    // those rows crimson, putting a red bar labelled Mystery directly above a
    // red bar labelled Horror. On the genre chart the key IS the category, so
    // anything outside the five-slot scale takes the neutral.
    const bars = genreBars([
      film({ genres: ["Horror", "Mystery"] }),
      film({ genres: ["Horror", "Science Fiction"] }),
    ]);
    const byKey = new Map(bars.map((b) => [b.key, b]));
    expect(byKey.get("Horror")!.color).toBe(GENRE_COLORS.Horror);
    for (const k of ["Mystery", "Science Fiction"]) {
      expect(byKey.get(k)!.genre).toBe("Other");
      expect(byKey.get(k)!.color).toBe(GENRE_COLORS.Other);
    }
  });

  it("still colours a COUNTRY by its dominant genre, which is where that rule belongs", () => {
    const bars = countryBars([
      film({ production_countries: ["JP"], genres: ["Horror"] }),
      film({ production_countries: ["JP"], genres: ["Horror"] }),
      film({ production_countries: ["JP"], genres: ["Drama"] }),
    ]);
    expect(bars[0].genre).toBe("Horror");
    expect(bars[0].color).toBe(GENRE_COLORS.Horror);
  });

  it("keeps genres primaryGenre would have collapsed into Other", () => {
    // The site's primaryGenre recognises five genres. Using it here would file
    // all four of these under one bar and lose most of the list.
    const films = [
      film({ genres: ["Documentary"] }),
      film({ genres: ["Crime"] }),
      film({ genres: ["Mystery"] }),
      film({ genres: ["Science Fiction"] }),
    ];
    expect(genreBars(films)).toHaveLength(4);
  });
});

describe("keywordBars", () => {
  it("applies the 3-film floor", () => {
    const films = [
      film({ keywords: ["murder", "noir"] }),
      film({ keywords: ["murder", "noir"] }),
      film({ keywords: ["murder"] }),
    ];
    expect(keywordBars(films, 12, 3).map((b) => b.key)).toEqual(["murder"]);
  });

  it("returns nothing when no keyword clears the floor, instead of an empty-ish chart", () => {
    expect(keywordBars([film({ keywords: ["one-off"] })], 12, 3)).toEqual([]);
  });
});

describe("countryBars / languageBars", () => {
  it("counts a co-production into every country", () => {
    const bars = countryBars([film({ production_countries: ["US", "GB"] })]);
    expect(bars.map((b) => b.count)).toEqual([1, 1]);
  });

  it("renders ISO codes as country names", () => {
    expect(countryBars([film({ production_countries: ["US"] })])[0].label).not.toBe("US");
  });

  it("skips films with no declared language rather than counting a blank", () => {
    const bars = languageBars([film({ language: null }), film({ language: "ja" })]);
    expect(bars.map((b) => b.key)).toEqual(["ja"]);
    expect(bars[0].count).toBe(1);
  });
});

describe("decadeBars", () => {
  it("keeps empty decades between the ends so a gap reads as a gap", () => {
    const bars = decadeBars([film({ year: 1920 }), film({ year: 1950 })]);
    expect(bars.map((b) => b.decade)).toEqual([1920, 1930, 1940, 1950]);
    expect(bars.map((b) => b.count)).toEqual([1, 0, 0, 1]);
  });

  it("floors a year to its decade", () => {
    const bars = decadeBars([film({ year: 1999 }), film({ year: 1990 })]);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ decade: 1990, label: "1990s", count: 2, share: 1 });
  });

  it("labels 2000s decades without colliding with 1900s ones", () => {
    const bars = decadeBars([film({ year: 1910 }), film({ year: 2010 })]);
    const labels = bars.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("excludes films with no release year", () => {
    expect(decadeBars([film({ year: null })])).toEqual([]);
  });
});

describe("watchlistSummary", () => {
  it("separates the films actually waiting from the ones already watched", () => {
    // Letterboxd leaves a logged film on the watchlist, so calling the whole
    // list "waiting" overstates it by exactly the watched count.
    const films = [film({ watched: true }), film({ watched: false }), film({ watched: false })];
    const s = watchlistSummary(films);
    expect(s.total).toBe(3);
    expect(s.watched).toBe(1);
    expect(s.unwatched).toBe(2);
  });

  it("measures the pre-2000 share against the whole list", () => {
    const films = [film({ year: 1980 }), film({ year: 1999 }), film({ year: 2000 })];
    expect(watchlistSummary(films).preMillenniumShare).toBeCloseTo(2 / 3);
    // 2000 itself is not "before 2000".
    expect(watchlistSummary([film({ year: 2000 })]).preMillenniumShare).toBe(0);
  });

  it("reports null bounds and a zero share for an empty list rather than NaN or Infinity", () => {
    const s = watchlistSummary([]);
    expect(s.oldest).toBeNull();
    expect(s.newest).toBeNull();
    expect(s.preMillenniumShare).toBe(0);
  });
});

describe("filterWatchlist", () => {
  const films = [
    film({ tmdb_id: 1, genres: ["Horror"], year: 1985, runtime: 90, language: "en", production_countries: ["US"] }),
    film({ tmdb_id: 2, genres: ["Drama"], year: 2015, runtime: 150, language: "ja", production_countries: ["JP", "FR"] }),
  ];

  it("filters on the film's primary genre, the same rule the rest of the site uses", () => {
    const out = filterWatchlist(films, { ...EMPTY, genres: new Set(["Horror"]) });
    expect(out.map((f) => f.tmdb_id)).toEqual([1]);
  });

  it("filters on release year, country, language and runtime", () => {
    expect(filterWatchlist(films, { ...EMPTY, releaseYearRange: [2000, 2020] })).toHaveLength(1);
    expect(filterWatchlist(films, { ...EMPTY, country: "FR" }).map((f) => f.tmdb_id)).toEqual([2]);
    expect(filterWatchlist(films, { ...EMPTY, language: "en" }).map((f) => f.tmdb_id)).toEqual([1]);
    expect(filterWatchlist(films, { ...EMPTY, runtimeRange: [0, 100] }).map((f) => f.tmdb_id)).toEqual([1]);
  });

  it("ignores the watch-only filters instead of emptying the charts", () => {
    // These controls are hidden in watchlist mode, but a URL can still carry
    // them in. A watchlist film has no rating and no watch date, so applying
    // them would drop every film and read as a broken page.
    const watchOnly: Filters = {
      ...EMPTY,
      ratingRange: [90, 100],
      yearRange: [2024, 2024],
      rewatch: "rewatch",
      selection: new Set(["nothing-matches"]),
      title: "no such film",
      rated: "R",
      franchise: "Some Collection",
    };
    expect(filterWatchlist(films, watchOnly)).toHaveLength(2);
  });

  it("drops a film with no release year when a year range is set", () => {
    const undated = [film({ tmdb_id: 9, year: null })];
    expect(filterWatchlist(undated, { ...EMPTY, releaseYearRange: [1900, 2030] })).toHaveLength(0);
  });
});
