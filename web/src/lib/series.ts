// Rolling-average-by-series logic, kept pure and framework-free so it can be
// unit-tested without React. The RollingRating chart is the only consumer.
//
// The chart answers: "as I watched more films of a given kind, where did my
// rolling 10-watch rating average settle?" The x-axis is the watch *number*
// within each series (1st, 2nd, …); the y-axis is the trailing-window mean of
// my rating. One line per category of the chosen dimension, plus a dimension-
// independent "overall" line across every rated watch.

import type { EnrichedWatch, Film } from "./types";
import { GENRE_COLORS, GENRE_ORDER, INK, primaryGenre, type GenreKey } from "./palette";
import { countryName } from "./countries";

export type Dimension = "genre" | "language" | "country" | "runtime" | "decade" | "mpaa";

export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "genre", label: "genre" },
  { key: "language", label: "language" },
  { key: "country", label: "country" },
  { key: "runtime", label: "runtime" },
  { key: "decade", label: "decade" },
  { key: "mpaa", label: "rating" }, // MPAA content rating
];

export const OTHER = "Other";
export const OVERALL_KEY = "__overall__";

// The five validated categorical slots (from palette.ts) reused across every
// categorical dimension, assigned in a fixed, count-stable order so cross-
// filtering never repaints a surviving series. "Other" stays neutral gray.
const SLOT_COLORS = [
  GENRE_COLORS.Horror, // crimson
  GENRE_COLORS.Thriller, // green
  GENRE_COLORS.Drama, // blue
  GENRE_COLORS.Comedy, // amber
  GENRE_COLORS.Adventure, // violet
];
const OTHER_COLOR = GENRE_COLORS.Other;

const RUNTIME_ORDER = ["< 95m", "95–114m", "115–134m", "135m+"] as const;

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// A sequential blue ramp (recent = darker) for *ordered* dimensions like decade,
// where hue-as-identity would be wrong. Every step clears 3:1 contrast on the
// light surface; lightness is monotonic. Validated with scripts/validate_palette.js.
function sequentialRamp(n: number): string[] {
  const H = 213;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    out.push(hslToHex(H, 58 + t * 16, 56 - t * 22));
  }
  return out;
}

/** year → decade bucket label (e.g. "1990s"); null when the year is unknown. */
export function releaseDecade(year: number | null | undefined): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/** Runtime in minutes → a coarse ordered bucket label (null when unknown). */
export function runtimeBucket(runtime: number | null | undefined): string | null {
  if (runtime == null || !Number.isFinite(runtime) || runtime <= 0) return null;
  if (runtime < 95) return "< 95m";
  if (runtime < 115) return "95–114m";
  if (runtime < 135) return "115–134m";
  return "135m+";
}

/** ISO 639-1 code → English language name, falling back to the upper-cased code. */
export function languageName(code: string): string {
  try {
    const n = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    if (n && n.toLowerCase() !== code.toLowerCase()) return n;
  } catch {
    /* Intl.DisplayNames unsupported — fall through */
  }
  return code.toUpperCase();
}

/**
 * The single category a film belongs to for a dimension. Multi-valued fields
 * (genre, country) collapse to their primary (first) entry. null = the film
 * can't be classified on this dimension and is excluded from that dimension's
 * per-series lines (it still counts toward the overall line).
 */
export function categoryOf(film: Film | undefined, dim: Dimension): string | null {
  if (!film) return null;
  switch (dim) {
    case "genre":
      return primaryGenre(film); // one of GENRE_KEYS, never null
    case "language":
      return film.language ? languageName(film.language) : null;
    case "country": {
      const iso = film.production_countries?.[0];
      return iso ? countryName(iso) : null;
    }
    case "runtime":
      return runtimeBucket(film.runtime);
    case "decade":
      return releaseDecade(film.year);
    case "mpaa":
      return film.rated || null;
  }
}

/** Trailing-window mean: out[i] = mean of the last `window` values up to i. */
export function rollingMean(values: number[], window = 10): number[] {
  const out: number[] = [];
  const q: number[] = [];
  let sum = 0;
  for (const v of values) {
    q.push(v);
    sum += v;
    if (q.length > window) sum -= q.shift() as number;
    out.push(sum / q.length);
  }
  return out;
}

export type SeriesPoint = { x: number; y: number; watch: EnrichedWatch };

export type Series = {
  key: string;
  label: string;
  color: string;
  points: SeriesPoint[];
  total: number; // rated watches in this series (before the warm-up trim)
  allWatches: EnrichedWatch[]; // every rated watch in order; index i ↔ x = i + 1
  isOverall?: boolean;
  isOther?: boolean;
};

export type BuildOptions = {
  window?: number; // rolling window length (watches)
  warmup?: number; // don't plot a point until the trailing window holds this many watches
  minWatches?: number; // a category needs this many rated watches (in `all`) to earn a hue slot
  minPoints?: number; // drop a series with fewer than this many rated points after filtering
  maxSeries?: number; // hue slots (categories beyond this fold into "Other")
};

type ColorPlan = {
  color: (cat: string) => string;
  hued: Set<string>; // categories that keep their own hue (vs. folding to Other)
  order: string[]; // hued categories in legend order
};

// Decide, from the full (unfiltered) dataset, which categories get a hue and in
// what order — computed once against `all` so the mapping is stable while the
// user cross-filters.
function planColors(all: EnrichedWatch[], dim: Dimension, opts: Required<BuildOptions>): ColorPlan {
  if (dim === "genre") {
    const order = GENRE_ORDER.filter((g) =>
      all.some((w) => w.rating != null && primaryGenre(w.film) === g),
    );
    return {
      color: (c) => GENRE_COLORS[c as GenreKey] ?? OTHER_COLOR,
      hued: new Set<string>(order), // genre "Other" is a real residual category, styled gray
      order: [...order],
    };
  }

  if (dim === "runtime") {
    const present = RUNTIME_ORDER.filter((b) =>
      all.some((w) => w.rating != null && runtimeBucket(w.film?.runtime) === b),
    );
    const map = new Map<string, string>();
    present.forEach((b, i) => map.set(b, SLOT_COLORS[i % SLOT_COLORS.length]));
    return { color: (c) => map.get(c) ?? OTHER_COLOR, hued: new Set(present), order: present };
  }

  if (dim === "decade") {
    // Ordered by decade (not by count): decades with enough rated watches to
    // support a rolling line, oldest → newest, on a sequential ramp. Sparse
    // early decades drop out of the panels (they still count toward overall).
    const counts = new Map<string, number>();
    for (const w of all) {
      if (w.rating == null) continue;
      const c = releaseDecade(w.film?.year);
      if (c == null) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const present = [...counts.entries()]
      .filter(([, n]) => n >= opts.minWatches)
      .map(([c]) => c)
      .sort((a, b) => parseInt(a) - parseInt(b));
    const ramp = sequentialRamp(present.length);
    const map = new Map<string, string>();
    present.forEach((c, i) => map.set(c, ramp[i]));
    return { color: (c) => map.get(c) ?? OTHER_COLOR, hued: new Set(present), order: present };
  }

  // Dynamic dimensions: rank categories by rated-watch count, keep the top few
  // that clear the threshold; everything else folds into "Other".
  const counts = new Map<string, number>();
  for (const w of all) {
    if (w.rating == null) continue;
    const c = categoryOf(w.film, dim);
    if (c == null) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= opts.minWatches)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, opts.maxSeries)
    .map(([c]) => c);
  const map = new Map<string, string>();
  ranked.forEach((c, i) => map.set(c, SLOT_COLORS[i % SLOT_COLORS.length]));
  return { color: (c) => map.get(c) ?? OTHER_COLOR, hued: new Set(ranked), order: ranked };
}

function byDate(a: EnrichedWatch, b: EnrichedWatch): number {
  return a.d.getTime() - b.d.getTime();
}

/** The series key a watch contributes to (null = excluded from per-series lines). */
function seriesKey(film: Film | undefined, dim: Dimension, hued: Set<string>): string | null {
  const c = categoryOf(film, dim);
  if (c == null) return null;
  if (dim === "genre") return c; // includes "Other"
  // Ordinal dimensions have no residual bucket: an out-of-plan category is simply
  // excluded from the panels (still counted in overall), not folded into "Other".
  if (dim === "runtime" || dim === "decade") return hued.has(c) ? c : null;
  return hued.has(c) ? c : OTHER;
}

function label(key: string, dim: Dimension): string {
  if (key === OVERALL_KEY) return "overall";
  if (key === OTHER) return dim === "genre" ? "other genre" : "other";
  return key;
}

/**
 * Build the plotted series from a (possibly cross-filtered) set of watches.
 * `all` seeds the stable color plan; `filtered` supplies the points to draw.
 */
export function buildSeries(
  all: EnrichedWatch[],
  filtered: EnrichedWatch[],
  dim: Dimension,
  options: BuildOptions = {},
): Series[] {
  const window = options.window ?? 10;
  const opts: Required<BuildOptions> = {
    window,
    warmup: options.warmup ?? window, // full window by default: first point = the 10th watch
    minWatches: options.minWatches ?? 12,
    minPoints: options.minPoints ?? window + 2, // need a few points past the warm-up
    maxSeries: options.maxSeries ?? 5, // up to 5 hued categories + "Other" = 6 panels
  };
  const plan = planColors(all, dim, opts);

  const rated = filtered.filter((w) => w.rating != null).sort(byDate);
  const groups = new Map<string, EnrichedWatch[]>();
  for (const w of rated) {
    const key = seriesKey(w.film, dim, plan.hued);
    if (key == null) continue;
    const g = groups.get(key);
    if (g) g.push(w);
    else groups.set(key, [w]);
  }

  const toSeries = (key: string, ws: EnrichedWatch[], extra: Partial<Series> = {}): Series => {
    const ys = rollingMean(
      ws.map((w) => w.rating as number),
      opts.window,
    );
    // Skip the warm-up: a "10-watch average" over 1–2 watches is just noise and
    // distorts the y-scale, so start plotting once the window has enough samples.
    // x stays the true watch number, so every series shares the same start.
    const start = Math.min(opts.warmup - 1, Math.max(0, ys.length - 1));
    const points: SeriesPoint[] = [];
    for (let i = start; i < ys.length; i++) points.push({ x: i + 1, y: ys[i], watch: ws[i] });
    return {
      key,
      label: label(key, dim),
      color: plan.color(key),
      points,
      total: ws.length,
      allWatches: ws,
      ...extra,
    };
  };

  const series: Series[] = [];
  // Hued categories first, in the stable legend order.
  for (const key of plan.order) {
    const ws = groups.get(key);
    if (ws && ws.length >= opts.minPoints) series.push(toSeries(key, ws));
  }
  // Then the "Other" residual, if it cleared the point threshold.
  const other = groups.get(OTHER);
  if (other && other.length >= opts.minPoints) {
    series.push(toSeries(OTHER, other, { color: OTHER_COLOR, isOther: true }));
  }
  // The overall line spans every rated watch, independent of the dimension.
  if (rated.length >= opts.minPoints) {
    series.push(toSeries(OVERALL_KEY, rated, { color: INK.primary, isOverall: true }));
  }
  return series;
}
