import { describe, it, expect } from "vitest";
import { ratingDeltaByKey, deltaLabel, DELTA_MIN_N } from "../ratingDelta";
import type { EnrichedWatch, Film } from "../types";

let nextId = 1;

function film(over: Partial<Film> = {}): Film {
  return {
    tmdb_id: nextId++,
    imdb_id: "tt0",
    title: "A Film",
    year: 2000,
    genres: [],
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
    language: "en",
    collection: null,
    ...over,
  };
}

function watch(f: Film, rating: number | null): EnrichedWatch {
  return {
    date: "2024-01-01",
    tmdb_id: f.tmdb_id,
    rating,
    stars: null,
    rewatch: false,
    liked: null,
    heart: null,
    film: f,
    d: new Date("2024-01-01T00:00:00Z"),
    yearFrac: 0,
  };
}

/** n films in `key`, each rated `rating`; plus filler to move the baseline. */
function group(key: string, n: number, rating: number): EnrichedWatch[] {
  return Array.from({ length: n }, () => watch(film({ production_countries: [key] }), rating));
}

describe("ratingDeltaByKey", () => {
  const keyOf = (w: EnrichedWatch) => w.film?.production_countries ?? [];

  it("measures a group's median against the median of the whole set", () => {
    // Ten films at 50 set the baseline; five at 70 sit 20 above it.
    const ws = [...group("BASE", 10, 50), ...group("HI", 5, 70)];
    const out = ratingDeltaByKey(ws, keyOf);
    expect(out.get("HI")?.delta).toBe(20);
    expect(out.get("HI")?.n).toBe(5);
  });

  it("signs a group below the baseline negative", () => {
    const ws = [...group("BASE", 10, 60), ...group("LO", 5, 40)];
    expect(ratingDeltaByKey(ws, keyOf).get("LO")!.delta).toBeLessThan(0);
  });

  it("omits a group below the minimum rather than drawing a bar on two films", () => {
    const ws = [...group("BASE", 10, 50), ...group("TINY", DELTA_MIN_N - 1, 95)];
    const out = ratingDeltaByKey(ws, keyOf);
    expect(out.has("TINY")).toBe(false);
    expect(out.has("BASE")).toBe(true);
  });

  it("counts a film once per key however many times it was watched", () => {
    // One film seen four times must not outvote four films seen once.
    const f = film({ production_countries: ["JP"] });
    const ws = [
      ...group("BASE", 10, 50),
      watch(f, 90),
      watch(f, 90),
      watch(f, 90),
      watch(f, 90),
      ...group("JP", 4, 90),
    ];
    // The rewatched film contributes one rating, so JP has 5 films, not 8.
    const out = ratingDeltaByKey(ws, keyOf);
    expect(out.get("JP")?.n).toBe(5);
  });

  it("averages a rewatched film's ratings into one value before taking the median", () => {
    const f = film({ production_countries: ["X"] });
    const ws = [
      ...group("BASE", 10, 50),
      // 40 and 80 average to 60, so this film enters the group median as 60.
      watch(f, 40),
      watch(f, 80),
      ...group("X", 4, 60),
    ];
    expect(ratingDeltaByKey(ws, keyOf).get("X")!.delta).toBe(10);
  });

  it("counts a multi-key film into every key it carries", () => {
    const ws = [
      ...group("BASE", 10, 50),
      ...Array.from({ length: 5 }, () =>
        watch(film({ production_countries: ["FR", "DE"] }), 70),
      ),
    ];
    const out = ratingDeltaByKey(ws, keyOf);
    expect(out.get("FR")?.n).toBe(5);
    expect(out.get("DE")?.n).toBe(5);
  });

  it("ignores unrated watches instead of scoring them zero", () => {
    const ws = [...group("BASE", 10, 50), ...group("U", 5, 70)];
    ws.push(watch(film({ production_countries: ["U"] }), null));
    expect(ratingDeltaByKey(ws, keyOf).get("U")?.n).toBe(5);
  });

  it("returns nothing when no watch carries a rating", () => {
    const ws = [watch(film({ production_countries: ["A"] }), null)];
    expect(ratingDeltaByKey(ws, keyOf).size).toBe(0);
  });
});

describe("deltaLabel", () => {
  it("signs positives with + and negatives with a true minus", () => {
    expect(deltaLabel(4.4)).toBe("+4");
    expect(deltaLabel(-7.2)).toBe("−7");
  });

  it("prints an unsigned zero, so 'at my median' does not read as a direction", () => {
    expect(deltaLabel(0)).toBe("0");
    expect(deltaLabel(0.3)).toBe("0");
  });
});
