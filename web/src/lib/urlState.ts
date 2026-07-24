import type { Filters } from "./store";
import type { GenreKey } from "./palette";
import { GENRE_KEYS } from "./palette";

/**
 * Filters ⇄ query-string codec so filtered views and stories are shareable
 * links. Only non-default values are encoded; the brush selection is
 * deliberately left out (hundreds of watch keys don't belong in a URL).
 */

export type UrlState = {
  story: string | null;
  filters: Partial<Filters>;
};

type Bounds = {
  yearBounds: [number, number];
  releaseYearBounds: [number, number];
  runtimeBounds: [number, number];
};

// My-rating scale is fixed, not data-derived.
const RATING_BOUNDS: [number, number] = [0, 100];

function encodeRange(range: [number, number] | null, bounds: [number, number]): string | null {
  if (!range) return null;
  if (range[0] === bounds[0] && range[1] === bounds[1]) return null;
  return `${range[0]}-${range[1]}`;
}

function parseRange(raw: string | null, bounds: [number, number]): [number, number] | null {
  if (!raw) return null;
  const m = /^(\d{1,4})-(\d{1,4})$/.exec(raw);
  if (!m) return null;
  const lo = Math.max(bounds[0], Number(m[1]));
  const hi = Math.min(bounds[1], Number(m[2]));
  if (lo > hi) return null;
  return [lo, hi];
}

/** Encode active story + filters as a query string ("" when all defaults). */
export function encodeUrlState(
  filters: Filters,
  activeStory: string | null,
  bounds: Bounds,
): string {
  const p = new URLSearchParams();
  // A story fully determines its filters, so it's encoded alone.
  if (activeStory) {
    p.set("story", activeStory);
    return p.toString();
  }
  if (filters.genres.size > 0) p.set("genres", [...filters.genres].sort().join(","));
  const watched = encodeRange(filters.yearRange, bounds.yearBounds);
  if (watched) p.set("watched", watched);
  const released = encodeRange(filters.releaseYearRange, bounds.releaseYearBounds);
  if (released) p.set("released", released);
  if (filters.rewatch !== "all") p.set("rewatch", filters.rewatch);
  if (filters.title) p.set("title", filters.title);
  if (filters.director) p.set("director", filters.director);
  if (filters.actor) p.set("actor", filters.actor);
  if (filters.country) p.set("country", filters.country);
  if (filters.language) p.set("language", filters.language);
  if (filters.rated) p.set("rated", filters.rated);
  if (filters.franchise) p.set("franchise", filters.franchise);
  const runtime = encodeRange(filters.runtimeRange, bounds.runtimeBounds);
  if (runtime) p.set("runtime", runtime);
  const rating = encodeRange(filters.ratingRange, RATING_BOUNDS);
  if (rating) p.set("rating", rating);
  return p.toString();
}

/** Parse a query string back into a story id or partial filters. */
export function parseUrlState(params: URLSearchParams, bounds: Bounds): UrlState {
  const story = params.get("story");
  if (story) return { story, filters: {} };

  const filters: Partial<Filters> = {};
  const genresRaw = params.get("genres");
  if (genresRaw) {
    const valid = genresRaw
      .split(",")
      .filter((g): g is GenreKey => (GENRE_KEYS as string[]).includes(g));
    if (valid.length > 0) filters.genres = new Set(valid);
  }
  const watched = parseRange(params.get("watched"), bounds.yearBounds);
  if (watched) filters.yearRange = watched;
  const released = parseRange(params.get("released"), bounds.releaseYearBounds);
  if (released) filters.releaseYearRange = released;
  const rewatch = params.get("rewatch");
  if (rewatch === "first" || rewatch === "rewatch") filters.rewatch = rewatch;
  const title = params.get("title");
  if (title) filters.title = title;
  const director = params.get("director");
  if (director) filters.director = director;
  const actor = params.get("actor");
  if (actor) filters.actor = actor;
  const country = params.get("country");
  if (country) filters.country = country;
  const language = params.get("language");
  if (language) filters.language = language;
  const rated = params.get("rated");
  if (rated) filters.rated = rated;
  const franchise = params.get("franchise");
  if (franchise) filters.franchise = franchise;
  const runtime = parseRange(params.get("runtime"), bounds.runtimeBounds);
  if (runtime) filters.runtimeRange = runtime;
  const rating = parseRange(params.get("rating"), RATING_BOUNDS);
  if (rating) filters.ratingRange = rating;
  return { story: null, filters };
}
