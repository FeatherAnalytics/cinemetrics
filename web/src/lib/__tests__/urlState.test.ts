import { describe, it, expect } from "vitest";
import { encodeUrlState, parseUrlState } from "../urlState";
import type { Filters } from "../store";
import type { GenreKey } from "../palette";

const BOUNDS = {
  yearBounds: [2019, 2026] as [number, number],
  releaseYearBounds: [1922, 2026] as [number, number],
  runtimeBounds: [5, 255] as [number, number],
};

const DEFAULTS: Filters = {
  genres: new Set<GenreKey>(),
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
  selection: null,
};

describe("encodeUrlState", () => {
  it("returns empty string for default filters", () => {
    expect(encodeUrlState(DEFAULTS, null, BOUNDS)).toBe("");
  });

  it("encodes a story alone, ignoring filters", () => {
    const filters = { ...DEFAULTS, country: "US" };
    expect(encodeUrlState(filters, "spooktober", BOUNDS)).toBe("story=spooktober");
  });

  it("omits ranges that span the full bounds", () => {
    const filters: Filters = { ...DEFAULTS, yearRange: [2019, 2026] };
    expect(encodeUrlState(filters, null, BOUNDS)).toBe("");
  });

  it("encodes non-default filters", () => {
    const filters: Filters = {
      ...DEFAULTS,
      genres: new Set<GenreKey>(["Horror", "Drama"]),
      yearRange: [2020, 2024],
      rewatch: "first",
      director: "Bong Joon-ho",
      country: "KR",
    };
    const p = new URLSearchParams(encodeUrlState(filters, null, BOUNDS));
    expect(p.get("genres")).toBe("Drama,Horror");
    expect(p.get("watched")).toBe("2020-2024");
    expect(p.get("rewatch")).toBe("first");
    expect(p.get("director")).toBe("Bong Joon-ho");
    expect(p.get("country")).toBe("KR");
  });
});

describe("parseUrlState", () => {
  it("round-trips filters through encode and parse", () => {
    const filters: Filters = {
      ...DEFAULTS,
      genres: new Set<GenreKey>(["Comedy"]),
      releaseYearRange: [1980, 1999],
      rewatch: "rewatch",
      title: "alien",
    };
    const qs = encodeUrlState(filters, null, BOUNDS);
    const parsed = parseUrlState(new URLSearchParams(qs), BOUNDS);
    expect(parsed.story).toBeNull();
    expect(parsed.filters.genres).toEqual(new Set(["Comedy"]));
    expect(parsed.filters.releaseYearRange).toEqual([1980, 1999]);
    expect(parsed.filters.rewatch).toBe("rewatch");
    expect(parsed.filters.title).toBe("alien");
  });

  it("returns the story when present", () => {
    const parsed = parseUrlState(new URLSearchParams("story=hidden-gems"), BOUNDS);
    expect(parsed.story).toBe("hidden-gems");
    expect(parsed.filters).toEqual({});
  });

  it("drops invalid genres and malformed ranges", () => {
    const parsed = parseUrlState(
      new URLSearchParams("genres=Horror,Musical&watched=oops&released=1990-1980"),
      BOUNDS,
    );
    expect(parsed.filters.genres).toEqual(new Set(["Horror"]));
    expect(parsed.filters.yearRange).toBeUndefined();
    expect(parsed.filters.releaseYearRange).toBeUndefined();
  });

  it("clamps ranges to the dataset bounds", () => {
    const parsed = parseUrlState(new URLSearchParams("watched=1900-2050"), BOUNDS);
    expect(parsed.filters.yearRange).toEqual([2019, 2026]);
  });

  it("ignores an empty query string", () => {
    const parsed = parseUrlState(new URLSearchParams(""), BOUNDS);
    expect(parsed.story).toBeNull();
    expect(parsed.filters).toEqual({});
  });

  it("round-trips language, rated, and franchise filters", () => {
    const filters: Filters = {
      ...DEFAULTS,
      language: "ko",
      rated: "PG-13",
      franchise: "MCU",
    };
    const qs = encodeUrlState(filters, null, BOUNDS);
    const parsed = parseUrlState(new URLSearchParams(qs), BOUNDS);
    expect(parsed.filters.language).toBe("ko");
    expect(parsed.filters.rated).toBe("PG-13");
    expect(parsed.filters.franchise).toBe("MCU");
  });

  it("round-trips runtime and rating ranges, omitting full spans", () => {
    const filters: Filters = {
      ...DEFAULTS,
      runtimeRange: [90, 120],
      ratingRange: [60, 100],
    };
    const qs = encodeUrlState(filters, null, BOUNDS);
    const parsed = parseUrlState(new URLSearchParams(qs), BOUNDS);
    expect(parsed.filters.runtimeRange).toEqual([90, 120]);
    expect(parsed.filters.ratingRange).toEqual([60, 100]);

    const full: Filters = { ...DEFAULTS, runtimeRange: [5, 255], ratingRange: [0, 100] };
    expect(encodeUrlState(full, null, BOUNDS)).toBe("");
  });
});
