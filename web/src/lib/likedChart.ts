// Pure helpers behind the `liked` prototypes. Kept out of the components so the
// rates can be tested directly: an affection rate with the wrong denominator
// renders perfectly and simply states a false number.

import type { EnrichedWatch, Watch } from "./types";

/* ------------------------------------------------ recovering the sheet era */

/**
 * The heart per FILM, taken from whichever of its watches recorded one.
 *
 * Hearting is a single toggle per film that Letterboxd stamps onto every diary
 * entry for it, so all of a film's watches carry the same value. That makes a
 * sheet-era row recoverable whenever the same film was watched again later: the
 * value is not missing, it is sitting on another row.
 *
 * 31 of the 129 unknown rows come back this way, across 27 films, and the
 * affection rate moves from 46.3% to 47.3%. The remaining 98 belong to 96 films
 * never watched again, and stay unknown.
 *
 * MUST be built from the FULL watch list, never a filtered one. Filtered to 2019
 * the Letterboxd-era rows are not in view, so a map built there would recover
 * nothing and the heart would blink back to unknown because of a filter, which is
 * not something a filter is allowed to change.
 */
export function filmHearts(watches: Watch[]): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const w of watches) {
    if (w.liked == null) continue;
    out.set(w.tmdb_id, w.liked);
  }
  return out;
}

/* --------------------------------------------------------- the known subset */

/**
 * Whether the heart is known for this watch, recorded or recovered.
 *
 * The heart is THREE-STATE: true / false / NULL, where NULL is UNKNOWN. The 129
 * pre-Letterboxd rows recorded no like data, because the Google Sheet they came
 * from had no such field. Counting them as "not liked" understates the affection
 * rate by about 7.5 points, so every rate in here divides by `known` and never by
 * the full watch list.
 *
 * Reads `heart` rather than raw `liked`, so the 31 rows recoverable from a later
 * watch of the same film count as the evidence they are.
 */
export function hasKnownLike(w: EnrichedWatch): boolean {
  return w.heart != null;
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
  const liked = known.filter((w) => w.heart === true).length;
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
 * quietly merged 4.5 stars with 5, which are 94% and 100% hearted and the two
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
 * anyway, since all 696 known-heart watches carry a rating.
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
