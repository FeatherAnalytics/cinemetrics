import { ACCENT, GENRE_COLORS } from "./palette";
import type { EnrichedWatch } from "./types";

/**
 * The heart vocabulary, used by every chart the favorites story reaches into.
 *
 * ONE set of three colors across the whole story, so a reader learns it once. The
 * charts it lands on already encode something else (genre on the swim lane, my
 * rating on the barcode), which is exactly why the story has to REPLACE those
 * encodings rather than add to them: two meanings on one channel is unreadable,
 * and the story's whole subject is the one bit these charts never showed.
 *
 * Reuses colors already in the palette rather than introducing any. Crimson is
 * the house accent, the blue is Drama's, and the pale is the same "no data" tint
 * every other chart uses, so nothing here needed the all-pairs validation re-run.
 */
export const HEART_LIKED = ACCENT;
export const HEART_COOL = GENRE_COLORS.Drama;
/**
 * Unknown, which is NOT "not liked".
 *
 * 98 watches recorded no heart and belong to films never watched again, so there
 * is nothing to recover them from. Painting them blue would assert a fact about
 * the sheet era that the sheet era simply never recorded.
 *
 * The chrome gray the stats charts use for a rest-of-the-data band, NOT the paler
 * `#eceae3` no-data tint. That tint is designed to be read as a region with an ink
 * outline around it, and these charts draw 3px dots and 2px stripes with no room
 * for one: on an off-white page the pale version simply vanished.
 */
export const HEART_UNKNOWN = "#b3b1a6";

type HeartState = "liked" | "not" | "unknown";

function heartState(w: EnrichedWatch): HeartState {
  if (w.heart == null) return "unknown";
  return w.heart ? "liked" : "not";
}

export function heartColor(w: EnrichedWatch): string {
  const s = heartState(w);
  return s === "liked" ? HEART_LIKED : s === "not" ? HEART_COOL : HEART_UNKNOWN;
}

/**
 * How much to fade a mark that is not hearted, keeping its own color.
 *
 * DIMMING RATHER THAN RECOLORING, because these charts already earn their colors:
 * the swim lane and the franchise dots carry genre, the barcode carries distance
 * from my median. Replacing that with a three-way heart palette bought one bit and
 * spent an encoding the reader had already learned. Fading spends nothing: the
 * hearted films come forward, everything else stays exactly what it was and stays
 * readable behind them.
 *
 * EVERYTHING not hearted fades, including watches whose heart was never recorded.
 * Giving those a gray fill was correct about the data and wrong on the page: all
 * 129 pre-Letterboxd watches land in 2019, so the entire first row turned gray and
 * lost the genre colors it has everywhere else. The three-state distinction is
 * load-bearing in a RATE, where counting unknown as "not liked" understates the
 * answer, and it is not load-bearing in a highlight, where the question is only
 * whether this mark is one of the hearted ones.
 */
const HEART_DIM = 0.6;

export function heartDim(w: EnrichedWatch): number {
  return heartDimForFilm(w.heart ?? undefined);
}

/** Watches carrying the heart. The subset the story's filtered charts work on. */
export function likedOnly(watches: EnrichedWatch[]): EnrichedWatch[] {
  return watches.filter((w) => w.heart === true);
}


/** The film-level twin of `heartDim`, for charts whose marks are films. */
function heartDimForFilm(heart: boolean | undefined): number {
  return heart === true ? 1 : HEART_DIM;
}

/**
 * The heart per film, for the charts whose marks are films rather than watches.
 *
 * The residual stack draws one dot per film and the franchise rows group by film,
 * so neither has a single watch to ask. Safe to collapse because the heart is one
 * toggle per film: every watch of a film carries the same value, which the data
 * confirms (no film in the library holds two different ones).
 */
export function heartByFilm(watches: EnrichedWatch[]): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const w of watches) {
    if (w.heart == null) continue;
    out.set(w.tmdb_id, w.heart);
  }
  return out;
}


type HeartShare = { liked: number; n: number; rate: number };

/**
 * The share of a group of watches that carry the heart, over the known ones only.
 *
 * Divides by watches whose heart is KNOWN, never by the group size, which is the
 * invariant every rate in this project holds: 98 watches recorded nothing, and
 * counting them as "not liked" understates the rate by about seven points.
 *
 * Returns null below `minKnown`. A country with two known watches produces 0% or
 * 100% by arithmetic, and drawn at full length beside a rate standing on a hundred
 * it makes the loudest claim in the chart from the least evidence.
 */
export function heartShare(
  watches: EnrichedWatch[],
  minKnown = 5,
): HeartShare | null {
  let liked = 0;
  let n = 0;
  for (const w of watches) {
    if (w.heart == null) continue;
    n += 1;
    if (w.heart) liked += 1;
  }
  if (n < minKnown) return null;
  return { liked, n, rate: liked / n };
}

/**
 * A group's heart rate as a signed distance from my overall rate, in percentage
 * points.
 *
 * The DEVIATION rather than the rate, because both charts this lands on already
 * draw a deviation and diverge around zero: the country bars mirror
 * me-minus-critics, the keyword bars sort from "I rate these higher" down to
 * lower. A bare rate is always positive, so it would collapse a two-sided chart
 * onto one side and answer a question neither chart is shaped to ask. It is also
 * the better statistic here: 46% means nothing without knowing my baseline is 47%.
 */
export function heartDeltaPP(rate: number, baseline: number): number {
  return (rate - baseline) * 100;
}

/**
 * A deviation label, in percent.
 *
 * Strictly these are percentage POINTS, and "pp" said so: a keyword at 94% against
 * a 47% baseline is +47pp, not 47% more often. The percent sign reads far better on
 * a chart, and the sign plus the blurb carry the "against my overall rate" framing
 * that the unit was doing on its own.
 */
export function ppLabel(pp: number): string {
  return `${pp > 0 ? "+" : pp < 0 ? "−" : ""}${Math.abs(pp).toFixed(0)}%`;
}
