import { describe, it, expect } from "vitest";
import { chartSetFor, computeStoryHeadlines, STORIES, swapsChartSet } from "../stories";
import { FOUR_FAVS } from "../fourFavs";
import type { EnrichedWatch, Film } from "../types";

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    tmdb_id: 100, imdb_id: "tt0000001", title: "Test", year: 2020,
    genres: ["Drama"], keywords: [], runtime: 120, budget: null,
    revenue: null, director: null, actors: null, metascore: 75,
    rt_rating: 80, imdb_rating: 70, imdb_votes: 50000,
    production_countries: [], rated: null, language: null, collection: null,
    poster: null,
    slice: null,
    ...overrides,
  };
}

function makeWatch(film: Film, overrides: Partial<EnrichedWatch> = {}): EnrichedWatch {
  const date = overrides.date ?? "2023-06-15";
  const d = new Date(date + "T00:00:00Z");
  return {
    date, tmdb_id: film.tmdb_id, rating: 70, stars: 3.5,
    rewatch: false, returned: false, liked: null, film, d, yearFrac: 0.45, ...overrides,
    heart: overrides.heart ?? overrides.liked ?? null,
  };
}

const spooktober = STORIES.find((s) => s.id === "spooktober")!;
const binges = STORIES.find((s) => s.id === "binges")!;
const franchises = STORIES.find((s) => s.id === "franchises")!;
const hiddenGems = STORIES.find((s) => s.id === "hidden-gems")!;
const runtime = STORIES.find((s) => s.id === "runtime")!;
const pickier = STORIES.find((s) => s.id === "getting-pickier")!;
const heart = STORIES.find((s) => s.id === "heart")!;

describe("runtime", () => {
  it("reports how much higher long films score and highlights them", () => {
    const long1 = makeFilm({ tmdb_id: 1, runtime: 165 });
    const long2 = makeFilm({ tmdb_id: 2, runtime: 152 });
    const short1 = makeFilm({ tmdb_id: 3, runtime: 82 });
    const short2 = makeFilm({ tmdb_id: 4, runtime: 78 });
    const watches = [
      makeWatch(long1, { tmdb_id: 1, rating: 92, date: "2023-01-01" }),
      makeWatch(long2, { tmdb_id: 2, rating: 88, date: "2023-02-01" }),
      makeWatch(short1, { tmdb_id: 3, rating: 60, date: "2023-03-01" }),
      makeWatch(short2, { tmdb_id: 4, rating: 64, date: "2023-04-01" }),
    ];
    const result = runtime.compute([long1, long2, short1, short2], watches);
    expect(result.headline).toMatch(/min\+/);
    expect(result.headline).toMatch(/above/);
    expect(result.notes).toBeDefined();
    expect(Object.keys(result.notes!).length).toBeGreaterThan(0);
    // Long films highlighted so they read as clustering high.
    expect(result.selection!.size).toBe(2);
  });

  it("degrades when a runtime bucket is empty", () => {
    const only = makeFilm({ tmdb_id: 1, runtime: 100 });
    const result = runtime.compute([only], [makeWatch(only, { tmdb_id: 1, rating: 70 })]);
    expect(result.headline).toBeTruthy();
    expect(result.selection).toBeUndefined();
  });
});

describe("getting-pickier", () => {
  it("reports fewer watches at a higher average over time", () => {
    const films: Film[] = [];
    const watches: EnrichedWatch[] = [];
    for (let i = 0; i < 8; i++) {
      const f = makeFilm({ tmdb_id: 100 + i });
      films.push(f);
      watches.push(makeWatch(f, { tmdb_id: f.tmdb_id, rating: 62, date: `2019-0${(i % 8) + 1}-10` }));
    }
    for (let i = 0; i < 3; i++) {
      const f = makeFilm({ tmdb_id: 200 + i });
      films.push(f);
      watches.push(makeWatch(f, { tmdb_id: f.tmdb_id, rating: 85, date: `2026-0${i + 1}-10` }));
    }
    const result = pickier.compute(films, watches);
    expect(result.headline).toBeTruthy();
    expect(result.notes).toBeDefined();
    expect(Object.keys(result.notes!).length).toBeGreaterThan(0);
  });
});

describe("spooktober", () => {
  it("focuses horror in October when any October horror exists", () => {
    const horror = makeFilm({ tmdb_id: 1, genres: ["Horror"] });
    const drama = makeFilm({ tmdb_id: 2, genres: ["Drama"] });
    const watches = [
      makeWatch(horror, { tmdb_id: 1, date: "2023-10-01" }),
      makeWatch(drama, { tmdb_id: 2, date: "2023-10-20" }),
      makeWatch(horror, { tmdb_id: 1, date: "2023-06-01" }),
    ];
    const result = spooktober.compute([horror, drama], watches);
    expect(result.headline).toBe("October is spooky season");
    expect(result.filters?.genres).toBeDefined();
    expect(result.monthFocus).toBe(9);
  });

  it("degrades when there is no October horror", () => {
    const drama = makeFilm({ tmdb_id: 2, genres: ["Drama"] });
    const result = spooktober.compute([drama], [makeWatch(drama, { date: "2023-10-20" })]);
    expect(result.headline).toContain("No horror");
    expect(result.monthFocus).toBeUndefined();
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

  it("judges a rewatched film by its latest rating, not the average", () => {
    // Rated 60 first, 90 on rewatch: average (75) would miss the 80 bar, but
    // the latest score is what counts.
    const grower = makeFilm({ tmdb_id: 1, title: "Grower", imdb_votes: 500 });
    const watches = [
      makeWatch(grower, { tmdb_id: 1, rating: 60, date: "2019-06-21" }),
      makeWatch(grower, { tmdb_id: 1, rating: 90, date: "2020-09-20", rewatch: true }),
    ];
    const result = hiddenGems.compute([grower], watches);
    expect(result.headline).toContain("Grower");
    // Both watches of the gem are selected, not just the qualifying one.
    expect(result.selection!.size).toBe(2);
  });

  it("drops a film whose latest rating fell below the bar", () => {
    const fader = makeFilm({ tmdb_id: 1, title: "Fader", imdb_votes: 500 });
    const watches = [
      makeWatch(fader, { tmdb_id: 1, rating: 90, date: "2019-06-21" }),
      makeWatch(fader, { tmdb_id: 1, rating: 60, date: "2020-09-20", rewatch: true }),
    ];
    const result = hiddenGems.compute([fader], watches);
    expect(result.headline).not.toContain("Fader");
  });

  it("notes how many gems lack full critic coverage", () => {
    const covered = makeFilm({ tmdb_id: 1, title: "Covered", imdb_votes: 500 });
    const uncovered = makeFilm({
      tmdb_id: 2, title: "Uncovered", imdb_votes: 500,
      metascore: null, rt_rating: null, imdb_rating: null,
    });
    const watches = [
      makeWatch(covered, { tmdb_id: 1, rating: 90 }),
      makeWatch(uncovered, { tmdb_id: 2, rating: 85 }),
    ];
    const result = hiddenGems.compute([covered, uncovered], watches);
    expect(result.notes?.contrarian).toContain("1 of the 2");
  });
});

describe("binges", () => {
  it("selects every watch on days with two or more films and names the peak day", () => {
    const a = makeFilm({ tmdb_id: 1 });
    const b = makeFilm({ tmdb_id: 2 });
    const c = makeFilm({ tmdb_id: 3 });
    const solo = makeFilm({ tmdb_id: 4 });
    const watches = [
      makeWatch(a, { tmdb_id: 1, date: "2023-06-15" }),
      makeWatch(b, { tmdb_id: 2, date: "2023-06-15" }),
      makeWatch(c, { tmdb_id: 3, date: "2023-06-15" }),
      makeWatch(solo, { tmdb_id: 4, date: "2023-06-20" }),
    ];
    const result = binges.compute([a, b, c, solo], watches);
    expect(result.headline).toContain("1 double-feature day");
    expect(result.headline).toContain("peaking at 3 films on June 15, 2023");
    expect(result.selection!.size).toBe(3); // the solo day is excluded
  });

  it("degrades when every day has a single watch", () => {
    const a = makeFilm({ tmdb_id: 1 });
    const result = binges.compute([a], [makeWatch(a, { tmdb_id: 1, date: "2023-06-15" })]);
    expect(result.headline).toContain("No double-feature");
    expect(result.selection).toBeUndefined();
  });
});

describe("franchises", () => {
  it("headlines the most-watched collection and selects all franchise watches", () => {
    const hp1 = makeFilm({ tmdb_id: 1, collection: "Wizard Collection" });
    const hp2 = makeFilm({ tmdb_id: 2, collection: "Wizard Collection" });
    const bond = makeFilm({ tmdb_id: 3, collection: "Spy Collection" });
    const standalone = makeFilm({ tmdb_id: 4 });
    const watches = [
      makeWatch(hp1, { tmdb_id: 1, date: "2021-12-25" }),
      makeWatch(hp2, { tmdb_id: 2, date: "2021-12-26" }),
      makeWatch(hp1, { tmdb_id: 1, date: "2022-12-25", rewatch: true }),
      // Only one Spy film watched, so it isn't a franchise run yet.
      makeWatch(bond, { tmdb_id: 3, date: "2022-01-01" }),
      makeWatch(standalone, { tmdb_id: 4, date: "2022-02-01" }),
    ];
    const result = franchises.compute([hp1, hp2, bond, standalone], watches);
    expect(result.headline).toBe("Wizard: 3 watches across 2 films");
    expect(result.selection!.size).toBe(3);
    expect(result.notes?.rewatch).toContain("%");
  });

  it("degrades when no collection has two watched films", () => {
    const solo = makeFilm({ tmdb_id: 1, collection: "Lonely Collection" });
    const result = franchises.compute([solo], [makeWatch(solo, { tmdb_id: 1 })]);
    expect(result.headline).toContain("No franchise runs");
  });
});

describe("chart sets", () => {
  it("shows the landing set with no story selected", () => {
    expect(chartSetFor(null)).toBe("landing");
    // Nothing is being swapped away from, so no story is dismissing anything.
    expect(swapsChartSet(null)).toBe(false);
  });

  it("falls back to narrative for an id that is not a story", () => {
    expect(chartSetFor("no-such-story")).toBe("narrative");
  });

  it("reads the set off the story rather than off its id", () => {
    expect(chartSetFor("heart")).toBe("heart");
    expect(swapsChartSet("heart")).toBe(true);
  });

  it("keeps the landing story out of the chip strip", () => {
    // The landing page is the default view, not an invitation, so offering a chip
    // for it would ask the reader to navigate to where they already are.
    const chips = computeStoryHeadlines([], []).map((c) => c.id);
    expect(chips).not.toContain("stats");
    expect(chips.length).toBe(STORIES.filter((s) => !s.landing).length);
  });

  it("has exactly one landing story, and it is the one the page falls back to", () => {
    const landing = STORIES.filter((s) => s.landing);
    expect(landing).toHaveLength(1);
    expect(chartSetFor(null)).toBe(landing[0].chartSet);
  });

  it("leaves the filter-driven stories on the narrative page", () => {
    for (const id of ["spooktober", "binges", "franchises", "runtime"]) {
      expect(chartSetFor(id)).toBe("narrative");
      expect(swapsChartSet(id)).toBe(false);
    }
  });

  it("gives every set-swapping story the three flags that make a swap work", () => {
    // A swap with the defaults would collapse the rail it depends on, scroll past
    // charts the reader has not seen, and freeze its headline while the rail moves.
    for (const s of STORIES.filter((s) => s.chartSet && s.chartSet !== "narrative")) {
      expect(s.dismissOnFilter, s.id).toBe(false);
      expect(s.scrollToPrimary, s.id).toBe(false);
      expect(s.recomputeOnFilter, s.id).toBe(true);
      expect(s.focus.dim, s.id).toEqual([]);
    }
  });
});

describe("heart", () => {
  const rated = (tmdb_id: number, rating: number, liked: boolean | null, date = "2023-06-15") =>
    makeWatch(makeFilm({ tmdb_id }), { tmdb_id, rating, liked, date });

  it("measures the crossover band rather than quoting it", () => {
    const watches = [
      rated(1, 60, false),
      rated(2, 70, true),
      rated(3, 70, false),
      rated(4, 80, true),
      rated(5, 100, true),
    ];
    const r = heart.compute([], watches);
    // The band is 70 to 89, so 60 and 100 are outside it: three watches in, two
    // hearted. 67%, and the 60 and the 100 must not reach the numerator.
    expect(r.headline).toContain("67%");
    expect(r.headline).toContain("3 watches");
  });

  it("says so plainly when nothing in view recorded a heart", () => {
    const r = heart.compute([], [rated(1, 80, null)]);
    expect(r.headline).toMatch(/No watch in view/);
    expect(r.subtext).toBeUndefined();
  });

  it("states no subtext: the tie chart shows the tie", () => {
    const fav = FOUR_FAVS[0].tmdb_id;
    const r = heart.compute([], [rated(fav, 100, true), rated(2, 100, true)]);
    // It used to name the most-rewatched film to argue the rating cannot single the
    // four out, and got it wrong: at the ceiling the most-rewatched film IS one.
    expect(r.subtext).toBeUndefined();
  });

  it("annotates only the charts that cannot speak for themselves", () => {
    const watches = [rated(1, 60, false), rated(2, 80, true), rated(3, 100, true)];
    const r = heart.compute([], watches);
    // The curve, the tie and the cohort charts print their own numbers, so a note
    // on any of them is the same finding twice.
    expect(Object.keys(r.notes ?? {}).sort()).toEqual(["favposters", "heartpredictors"]);
  });
});
