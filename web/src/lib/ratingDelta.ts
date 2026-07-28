// How far my rating for a group of films sits from my overall average.
//
// The watchlist charts need this because their own films have no rating: nobody
// has watched them. So the deviation beside a watchlist row is not about the
// films waiting — it is about the films ALREADY SEEN that share that country,
// language or keyword, and it answers "how have I felt about this sort of thing
// so far" rather than "how will I feel about these".
//
// Means, against the mean of the same watch set. A mean moves with every film
// in the group rather than only with the middle one, so a country I rate evenly
// well separates from one with a couple of standouts — and because ratings sit
// on a half-star lattice, medians quantised the whole track to 0, ±5 and ±10.

import type { EnrichedWatch } from "./types";

/** Minimum films behind a group before its deviation is shown at all. */
export const DELTA_MIN_N = 5;

export type RatingDelta = {
  delta: number; // group mean minus overall mean, in rating points (0-100)
  n: number; // films (not watches) behind the group mean
};

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * One rating per FILM, so a film watched four times does not outvote three
 * films watched once. A rewatched film's ratings are averaged into a single
 * value first — that is the film's standing with me, and it is what the group
 * mean should be built from.
 */
function ratingsByFilm(watches: EnrichedWatch[]): Map<number, number> {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const w of watches) {
    if (w.rating == null) continue;
    const e = sums.get(w.tmdb_id) ?? { sum: 0, n: 0 };
    e.sum += w.rating;
    e.n += 1;
    sums.set(w.tmdb_id, e);
  }
  const out = new Map<number, number>();
  for (const [id, { sum, n }] of sums) out.set(id, sum / n);
  return out;
}

/**
 * Rating deviation per group key, against the mean of the same watch set.
 *
 * The baseline moves with whatever is passed in, so under a filter the
 * deviations are measured against the films on screen rather than against a
 * library-wide number the reader can no longer see.
 *
 * Groups below `minN` are OMITTED rather than returned with a small `n`. A
 * deviation resting on two films is noise drawn at the same visual weight as
 * one resting on sixty, and the chart has no way to say so in a bar.
 */
export function ratingDeltaByKey(
  watches: EnrichedWatch[],
  keysOf: (w: EnrichedWatch) => string[],
  minN = DELTA_MIN_N,
): Map<string, RatingDelta> {
  const perFilm = ratingsByFilm(watches);
  const base = mean([...perFilm.values()]);
  const out = new Map<string, RatingDelta>();
  if (base == null) return out;

  // Collect one rating per film per key: a film contributing to several keys
  // (a co-production, a film with many keywords) votes once in each.
  const groups = new Map<string, Map<number, number>>();
  for (const w of watches) {
    const r = perFilm.get(w.tmdb_id);
    if (r == null) continue;
    for (const key of new Set(keysOf(w))) {
      if (!key) continue;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = new Map()));
      g.set(w.tmdb_id, r);
    }
  }

  for (const [key, films] of groups) {
    if (films.size < minN) continue;
    const m = mean([...films.values()]);
    if (m == null) continue;
    out.set(key, { delta: m - base, n: films.size });
  }
  return out;
}

/** Signed rating points, e.g. "+4" / "−7" / "0". */
export function deltaLabel(delta: number): string {
  const r = Math.round(delta);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}`;
}
