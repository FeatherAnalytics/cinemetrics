// Pure helpers behind the `liked` prototypes. Kept out of the components so the
// rates can be tested directly: an affection rate with the wrong denominator
// renders perfectly and simply states a false number.

import type { EnrichedWatch } from "./types";

/* --------------------------------------------------------- the known subset */

/**
 * Whether this watch recorded the Letterboxd heart at all.
 *
 * `liked` is THREE-STATE: true / false / NULL, where NULL is UNKNOWN. The 129
 * pre-Letterboxd rows have no like data, because the Google Sheet they came from
 * had no such field. Counting them as "not liked" understates the affection rate
 * by about 7.5 points, so every rate in here divides by `known` and never by the
 * full watch list.
 */
export function hasKnownLike(w: EnrichedWatch): boolean {
  return w.liked != null;
}

export function knownWatches(watches: EnrichedWatch[]): EnrichedWatch[] {
  return watches.filter(hasKnownLike);
}

export type Rate = {
  /** Watches with the heart. */
  liked: number;
  /** Watches that RECORDED a heart state, the only honest denominator. */
  n: number;
  /** 0..1, or 0 when nothing recorded one. */
  rate: number;
};

/**
 * The affection rate over a group of watches.
 *
 * Filters to the known subset itself rather than trusting the caller, because
 * every path into this function has had a filter applied somewhere upstream and
 * one of them will eventually forget.
 */
export function likedRate(watches: EnrichedWatch[]): Rate {
  const known = knownWatches(watches);
  const liked = known.filter((w) => w.liked === true).length;
  return { liked, n: known.length, rate: known.length ? liked / known.length : 0 };
}

/* -------------------------------------------------------------- star bins */

/**
 * Half-star bins, the rating axis every other chart here draws.
 *
 * Not an approximation of the 0-100 scale: it IS the scale. Letterboxd only
 * accepts half stars, `my_rating` is `star_rating * 20` exactly, and every
 * rating in the library is a clean multiple of ten. So a bin holds one rating
 * value rather than a range, and ten-point "bands" were the same bins under
 * labels that implied otherwise. "60s" contained nothing but 60, and "90+"
 * quietly merged 4.5 stars with 5, which are 97% and 100% hearted and the two
 * ends of the curve worth telling apart.
 *
 * Half stars and not whole ones, because the flip happens between 3.5 and 4.
 * Rounding to whole stars would put the entire finding inside one column.
 *
 * The low tail is kept rather than collapsed. One and 1.5 stars are two watches
 * each, which `RateBars` already fades below its thin-n floor, and that reads
 * more honestly than a "<2.5" bucket the axis has to explain.
 */
// Typed as numbers rather than a literal union: callers look bins up by value
// (`STAR_BINS.indexOf(CROSSOVER_STARS[0])`), and a union would make every one of
// those a cast for no safety worth having.
export const STAR_BINS: readonly number[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** The house rating label: `{rating / 20}★`, matching RatingsByGenre's axis. */
export function starLabel(stars: number): string {
  return `${stars}★`;
}

/**
 * The bin a rating falls in, by rounding to the nearest half star.
 *
 * Derived from `rating` rather than read off `stars` so there is one source of
 * truth for the scale, and rounded rather than matched exactly so a rating that
 * is somehow not a clean multiple of ten lands in its closest bin instead of
 * vanishing from the chart.
 */
export function starBinIndex(rating: number): number {
  return STAR_BINS.indexOf(Math.round(rating / 10) / 2);
}

/**
 * Known-like watches grouped into the star bins.
 *
 * Unrated watches are dropped rather than bucketed: there is no bin for "no
 * rating" on a rating axis, and in this dataset the question never comes up
 * anyway, since all 665 known-like watches carry a rating.
 */
export function byStarBin(watches: EnrichedWatch[]): EnrichedWatch[][] {
  const out: EnrichedWatch[][] = STAR_BINS.map(() => []);
  for (const w of knownWatches(watches)) {
    if (w.rating == null) continue;
    const i = starBinIndex(w.rating);
    if (i >= 0) out[i].push(w);
  }
  return out;
}

/* ---------------------------------------------------------- the middle band */

/**
 * The zone where the heart is actually in question: 3.5 and 4 stars.
 *
 * Below 3.5 the heart is essentially never given and at 4.5 and up essentially
 * always, so a predictor tested across the whole scale is really just
 * rediscovering the rating. Anything claiming to move affection has to move it
 * in HERE, where the rate sits near a coin flip, or it has moved the rating
 * instead.
 *
 * Held in rating points because that is what the column stores; 70 to 89 spans
 * exactly the 70 and 80 values, which are 3.5 and 4 stars. `CROSSOVER_STARS` is
 * the same band for anything that has to say it out loud.
 */
export const CROSSOVER: [number, number] = [70, 89];
export const CROSSOVER_STARS: [number, number] = [3.5, 4];

export function inCrossover(w: EnrichedWatch): boolean {
  return w.rating != null && w.rating >= CROSSOVER[0] && w.rating <= CROSSOVER[1];
}

export function crossoverWatches(watches: EnrichedWatch[]): EnrichedWatch[] {
  return knownWatches(watches).filter(inCrossover);
}

/* -------------------------------------------------------- admired not loved */

export type AdmiredFilm = {
  tmdb_id: number;
  title: string;
  /** Highest rating given across this film's watches. */
  rating: number;
  watches: EnrichedWatch[];
};

/**
 * Films rated at or above `minRating` that never got the heart.
 *
 * Grouped by FILM rather than listed per watch. The heart does not vary between
 * a film's viewings (see the note on the three-state column), so a rewatched
 * title would otherwise appear two or three times in a list whose whole content
 * is one bit per film.
 *
 * The reverse set, hearted films rated LOW, is not worth a chart: there are
 * three of them.
 */
export function admiredNotLoved(
  watches: EnrichedWatch[],
  minRating = 80,
): AdmiredFilm[] {
  const byFilm = new Map<number, AdmiredFilm>();
  for (const w of knownWatches(watches)) {
    if (w.liked !== false || w.rating == null || w.rating < minRating) continue;
    const prev = byFilm.get(w.tmdb_id);
    if (prev) {
      prev.rating = Math.max(prev.rating, w.rating);
      prev.watches.push(w);
      continue;
    }
    byFilm.set(w.tmdb_id, {
      tmdb_id: w.tmdb_id,
      title: w.film?.title ?? "Unknown",
      rating: w.rating,
      watches: [w],
    });
  }
  return [...byFilm.values()].sort(
    (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
  );
}

/**
 * The mirror set: films that got the heart despite a low rating.
 *
 * Counted rather than charted, because across the whole library there are three
 * of them. The count is what makes "admired, not loved" a one-sided finding
 * instead of half of a symmetry, so it has to be computed against the CURRENT
 * filter rather than quoted from the full dataset. Under a Horror filter the
 * full-library figure would be a sentence about films not on screen.
 */
export function lovedNotAdmired(
  watches: EnrichedWatch[],
  maxRating = 65,
): number {
  const films = new Set<number>();
  for (const w of knownWatches(watches)) {
    if (w.liked === true && w.rating != null && w.rating <= maxRating) {
      films.add(w.tmdb_id);
    }
  }
  return films.size;
}

/* ------------------------------------------- candidate predictors, in-band */

/**
 * Runtime bands, in minutes.
 *
 * Chosen around the feature-length conventions rather than on quantiles, so the
 * labels mean something to a reader who has never seen my distribution.
 */
export const RUNTIME_BANDS = [
  { label: "<90", lo: 0, hi: 89 },
  { label: "90-104", lo: 90, hi: 104 },
  { label: "105-119", lo: 105, hi: 119 },
  { label: "120-139", lo: 120, hi: 139 },
  { label: "140+", lo: 140, hi: Infinity },
] as const;

export function runtimeBandIndex(runtime: number): number {
  for (let i = 0; i < RUNTIME_BANDS.length; i++) {
    if (runtime >= RUNTIME_BANDS[i].lo && runtime <= RUNTIME_BANDS[i].hi) return i;
  }
  return -1;
}

export function byRuntimeBand(watches: EnrichedWatch[]): EnrichedWatch[][] {
  const out: EnrichedWatch[][] = RUNTIME_BANDS.map(() => []);
  for (const w of knownWatches(watches)) {
    const rt = w.film?.runtime;
    if (rt == null) continue;
    const i = runtimeBandIndex(rt);
    if (i >= 0) out[i].push(w);
  }
  return out;
}

/**
 * Watches split by whether they recorded a rewatch, for the affection question.
 *
 * `rewatch` is three-state in the same disguised way `liked` is: the 129
 * sheet-era rows carry `false` because the Google Sheet had no such field. Those
 * rows are already excluded here, since `knownWatches` drops exactly them.
 */
export function byRewatch(watches: EnrichedWatch[]): EnrichedWatch[][] {
  const known = knownWatches(watches);
  return [known.filter((w) => !w.rewatch), known.filter((w) => w.rewatch)];
}

export const REWATCH_LABELS = ["first", "rewatch"] as const;

/* ------------------------------------------------------------- by watch year */

export type YearRate = { year: number; rate: Rate };

/**
 * Affection rate per calendar year of WATCHING.
 *
 * The year comes off the date string, not off a Date: `watched_date` is already
 * a Chicago calendar date, and a UTC parse moves a January 1 watch into the
 * previous year.
 */
export function likedByWatchYear(watches: EnrichedWatch[], minN = 10): YearRate[] {
  const byYear = new Map<number, EnrichedWatch[]>();
  for (const w of knownWatches(watches)) {
    const year = Number(w.date.slice(0, 4));
    const bucket = byYear.get(year);
    if (bucket) bucket.push(w);
    else byYear.set(year, [w]);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, ws]) => ({ year, rate: likedRate(ws) }))
    // A year with a handful of watches swings twenty points on one heart, which
    // reads as a trend and is arithmetic. 2019 is two watches.
    .filter((r) => r.rate.n >= minN);
}
