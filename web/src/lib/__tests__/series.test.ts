import { describe, it, expect } from "vitest";
import type { EnrichedWatch, Film } from "../types";
import { GENRE_COLORS } from "../palette";
import {
  buildSeries,
  categoryOf,
  languageName,
  OTHER,
  OVERALL_KEY,
  releaseDecade,
  rollingMean,
  runtimeBucket,
} from "../series";

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    tmdb_id: 1,
    imdb_id: "tt0000001",
    title: "Test Film",
    year: 2020,
    genres: ["Drama"],
    keywords: [],
    runtime: 120,
    budget: null,
    revenue: null,
    director: null,
    actors: null,
    metascore: null,
    rt_rating: null,
    imdb_rating: null,
    imdb_votes: null,
    production_countries: ["US"],
    rated: "R",
    language: "en",
    collection: null,
    ...overrides,
  };
}

let tid = 100;
function watch(rating: number | null, film: Partial<Film>, date = "2021-01-01"): EnrichedWatch {
  const f = makeFilm({ tmdb_id: tid++, ...film });
  const d = new Date(date + "T00:00:00Z");
  return { date, tmdb_id: f.tmdb_id, rating, stars: null, rewatch: false, film: f, d, yearFrac: 0 };
}

// Successive daily watches, so date ordering matches array order.
function series(ratings: (number | null)[], film: Partial<Film>): EnrichedWatch[] {
  return ratings.map((r, i) => {
    const day = String((i % 27) + 1).padStart(2, "0");
    const month = String((Math.floor(i / 27) % 12) + 1).padStart(2, "0");
    return watch(r, film, `2021-${month}-${day}`);
  });
}

describe("rollingMean", () => {
  it("uses a trailing window, with a partial window until it fills", () => {
    expect(rollingMean([10, 20, 30], 2)).toEqual([10, 15, 25]);
  });

  it("averages everything when the window is larger than the data", () => {
    expect(rollingMean([1, 2, 3, 4], 10)).toEqual([1, 1.5, 2, 2.5]);
  });

  it("returns an empty array for no values", () => {
    expect(rollingMean([], 10)).toEqual([]);
  });
});

describe("runtimeBucket", () => {
  it("buckets at the documented boundaries", () => {
    expect(runtimeBucket(94)).toBe("< 95m");
    expect(runtimeBucket(95)).toBe("95–114m");
    expect(runtimeBucket(114)).toBe("95–114m");
    expect(runtimeBucket(115)).toBe("115–134m");
    expect(runtimeBucket(134)).toBe("115–134m");
    expect(runtimeBucket(135)).toBe("135m+");
  });

  it("returns null for missing or nonsensical runtimes", () => {
    expect(runtimeBucket(null)).toBeNull();
    expect(runtimeBucket(0)).toBeNull();
    expect(runtimeBucket(-5)).toBeNull();
  });
});

describe("languageName", () => {
  it("resolves known ISO 639-1 codes", () => {
    expect(languageName("en")).toBe("English");
  });

  it("falls back to the upper-cased code when unknown", () => {
    expect(languageName("zz")).toBe("ZZ");
  });
});

describe("releaseDecade", () => {
  it("buckets a year into its decade", () => {
    expect(releaseDecade(1994)).toBe("1990s");
    expect(releaseDecade(2000)).toBe("2000s");
    expect(releaseDecade(2019)).toBe("2010s");
  });
  it("returns null for a missing year", () => {
    expect(releaseDecade(null)).toBeNull();
  });
});

describe("categoryOf", () => {
  it("picks the primary tracked genre", () => {
    expect(categoryOf(makeFilm({ genres: ["Comedy", "Horror"] }), "genre")).toBe("Horror");
    expect(categoryOf(makeFilm({ genres: ["Western"] }), "genre")).toBe("Other");
  });

  it("claims Adventure only when no higher-priority genre is present", () => {
    expect(categoryOf(makeFilm({ genres: ["Adventure"] }), "genre")).toBe("Adventure");
    expect(categoryOf(makeFilm({ genres: ["Adventure", "Comedy"] }), "genre")).toBe("Comedy");
  });

  it("maps language, country, runtime, and mpaa", () => {
    expect(categoryOf(makeFilm({ language: "ja" }), "language")).toBe("Japanese");
    expect(categoryOf(makeFilm({ production_countries: ["JP", "US"] }), "country")).toBe("Japan");
    expect(categoryOf(makeFilm({ runtime: 100 }), "runtime")).toBe("95–114m");
    expect(categoryOf(makeFilm({ rated: "PG-13" }), "mpaa")).toBe("PG-13");
  });

  it("returns null when the field is absent", () => {
    expect(categoryOf(makeFilm({ language: null }), "language")).toBeNull();
    expect(categoryOf(makeFilm({ production_countries: [] }), "country")).toBeNull();
    expect(categoryOf(makeFilm({ rated: null }), "mpaa")).toBeNull();
    expect(categoryOf(undefined, "genre")).toBeNull();
  });
});

describe("buildSeries", () => {
  const opts = { window: 3, minPoints: 3, minWatches: 1 } as const;

  it("builds one line per category plus an overall line", () => {
    const all = [
      ...series([60, 62, 64, 66, 68], { genres: ["Horror"] }),
      ...series([80, 82, 84, 86, 88], { genres: ["Comedy"] }),
    ];
    const out = buildSeries(all, all, "genre", opts);
    const keys = out.map((s) => s.key);
    expect(keys).toContain("Horror");
    expect(keys).toContain("Comedy");
    expect(keys).toContain(OVERALL_KEY);

    const overall = out.find((s) => s.isOverall)!;
    expect(overall.total).toBe(10); // every rated watch
    expect(overall.label).toBe("overall");

    const horror = out.find((s) => s.key === "Horror")!;
    expect(horror.color).toBe(GENRE_COLORS.Horror);
    // warmup defaults to the window (3): first plotted point is the 3rd watch,
    // whose value is the mean of the first three ratings.
    expect(horror.points[0].x).toBe(3);
    expect(horror.points[0].y).toBeCloseTo((60 + 62 + 64) / 3);
  });

  it("drops series below minPoints and ignores unrated watches", () => {
    const all = [
      ...series([60, 62, 64, 66, 68], { genres: ["Horror"] }),
      ...series([80, 82], { genres: ["Comedy"] }), // only 2 → below minPoints
      ...series([null, null], { genres: ["Thriller"] }), // unrated → excluded
    ];
    const out = buildSeries(all, all, "genre", opts);
    const keys = out.map((s) => s.key);
    expect(keys).toContain("Horror");
    expect(keys).not.toContain("Comedy");
    expect(keys).not.toContain("Thriller");
    // overall spans every rated watch (5 Horror + 2 Comedy), even though Comedy's
    // own line was dropped and the Thriller watches were unrated.
    expect(out.find((s) => s.isOverall)!.total).toBe(7);
  });

  it("folds categories beyond maxSeries into Other for dynamic dimensions", () => {
    const all = [
      ...series([60, 62, 64, 66, 68], { language: "en" }),
      ...series([70, 72, 74, 76, 78], { language: "ja" }),
      ...series([50, 52, 54, 56, 58], { language: "fr" }),
    ];
    const out = buildSeries(all, all, "language", { ...opts, maxSeries: 1 });
    const keys = out.map((s) => s.key);
    // English has the most watches (tie broken, but all equal here → alphabetical
    // within count) so only one hue slot survives; the rest fold into Other.
    expect(keys).toContain(OTHER);
    expect(keys.filter((k) => k !== OTHER && k !== OVERALL_KEY)).toHaveLength(1);
  });

  it("orders decade panels chronologically, not by count, with no Other bucket", () => {
    const all = [
      ...series([60, 62, 64, 66, 68], { year: 1994 }), // 1990s ·5
      ...series([70, 72, 74, 76, 78], { year: 2003 }), // 2000s ·5
      ...series([50, 52, 54, 56, 58, 55, 57, 59], { year: 2015 }), // 2010s ·8 (most)
      ...series([80, 82], { year: 1925 }), // 1920s ·2 — below minWatches, dropped
    ];
    const out = buildSeries(all, all, "decade", { window: 3, minPoints: 3, minWatches: 4 });
    const cats = out.filter((s) => !s.isOverall).map((s) => s.key);
    expect(cats).toEqual(["1990s", "2000s", "2010s"]); // chronological despite 2010s having more
    expect(out.some((s) => s.key === OTHER)).toBe(false);
    // 1920s excluded from panels but still counted in the overall line.
    expect(out.find((s) => s.isOverall)!.total).toBe(20);
    // sequential ramp: distinct colours in decade order.
    expect(cats.length).toBe(new Set(out.filter((s) => !s.isOverall).map((s) => s.color)).size);
  });

  it("keeps the colour plan stable when the filtered set shrinks", () => {
    const all = [
      ...series([60, 62, 64, 66, 68], { language: "en" }),
      ...series([70, 72, 74, 76, 78], { language: "ja" }),
    ];
    const full = buildSeries(all, all, "language", opts);
    const enColorFull = full.find((s) => s.key === "English")!.color;
    // Filter down to only Japanese watches; English no longer appears, but the
    // colour plan is seeded from `all`, so surviving series keep their hues.
    const jaOnly = all.filter((w) => w.film?.language === "ja");
    const filtered = buildSeries(all, jaOnly, "language", opts);
    expect(filtered.find((s) => s.key === "English")).toBeUndefined();
    const ja = filtered.find((s) => s.key === "Japanese")!;
    expect(ja.color).toBe(full.find((s) => s.key === "Japanese")!.color);
    expect(ja.color).not.toBe(enColorFull);
  });
});
