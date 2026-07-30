// Pure helpers behind the stats charts. Kept out of the components so they can
// be tested directly: several of them are statistics whose being quietly wrong
// would not show up as a broken render, only as a false claim on the page.

import { GENRE_ORDER, type GenreKey } from "./palette";
import type { EnrichedWatch } from "./types";

/* ------------------------------------------------------------ chart chrome */

/**
 * The "no data" outline, drawn INSIDE the mark's bounds.
 *
 * An SVG stroke straddles the path, so half of it sits outside the rect and an
 * outlined shape reads as physically larger than its unoutlined neighbors. In a
 * heatmap that makes single-film cells look like a different cell size, which is
 * a size encoding nobody meant.
 */
export const NO_DATA_STROKE = 0.75;

export function insetRect(x: number, y: number, w: number, h: number) {
  const i = NO_DATA_STROKE / 2;
  return {
    x: x + i,
    y: y + i,
    width: Math.max(w - NO_DATA_STROKE, 0),
    height: Math.max(h - NO_DATA_STROKE, 0),
  };
}

export function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Ticks at a fixed interval rather than a fixed count.
 *
 * A proportional scale (quarters, thirds) puts ticks on whatever the data
 * happens to total, so the axis reads 199 / 397 / 596. Round intervals give the
 * reader numbers they can do arithmetic with, and the top of the scale is padded
 * up to the next interval so the highest tick is never clipped off the plot.
 */
export function ticksEvery(max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/** The scale ceiling for `ticksEvery`: the next interval at or above `max`. */
export function ceilTo(max: number, step: number): number {
  return Math.ceil(max / step) * step;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * A rate rendered as its reciprocal: days between films.
 *
 * Only the LABEL inverts. Bar height stays the rate, so taller still means more
 * watching. Plotting days-per-film as the height would flip that, and an
 * inverted axis fighting the reader's intuition is what sank the "one film every
 * N days" prototype.
 */
export function paceLabel(v: number): string {
  if (v <= 0) return "-";
  return (1 / v).toFixed(1);
}

/* ------------------------------------------------------- shared vocabulary */

// One spelling of a month across every chart. Three letters, never initials:
// "J F M A M J J A S O N D" has three J's and two each of M and A, so a reader
// cannot tell June from July and the labels are not unique keys either.
export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Monday first, so the weekend sits together at the right-hand end.
export const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKEND = [5, 6];

/**
 * Genres in alphabetical order, with "Other" pinned last.
 *
 * `GENRE_ORDER` in the palette is a PRIORITY order (Horror wins when a film
 * carries several), which is the right rule for assigning a color and the wrong
 * one for laying out an axis: it makes a reader hunt for a genre by name. Every
 * chart that displays genres uses this instead. Other is a catch-all rather than
 * a genre, so it sits at the end regardless of its initial.
 */
export const GENRE_ALPHA: GenreKey[] = [
  ...GENRE_ORDER.slice().sort((a, b) => a.localeCompare(b)),
  "Other",
];


/* ---------------------------------------------------------------- calendar */

/**
 * Month (0-11), weekday (0=Mon) and year for a watch, in CHICAGO local time.
 *
 * There is no conversion here, and that is the point. `watched_date` comes from
 * Letterboxd's `letterboxd:watchedDate`, a bare YYYY-MM-DD with no timestamp,
 * chosen by the user in local time and stored verbatim through ingest. The
 * string ALREADY IS the Chicago calendar date.
 *
 * Running it through a UTC to America/Chicago conversion would be actively
 * wrong: `new Date("2024-10-15")` is midnight UTC, which is 19:00 on 2024-10-14
 * in Chicago, so every watch would shift back a day and the whole weekday
 * distribution would rotate by one. Components are parsed off the string so no
 * Date timezone semantics can get in and do that.
 */
export function chicagoParts(date: string): { month: number; dow: number; year: number } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const dow = (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
  return { month, dow, year };
}

// Leap-year cumulative day offsets. Using these in EVERY year means a calendar
// date lands on the same index regardless of leap status: March 1 is 60 always,
// and common years simply never use index 59. Indexing by naive days-since-Jan-1
// would slide every date after February back one in common years, so year lines
// would compare the wrong calendar days against each other.
export const LEAP_OFFSETS = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export const YEAR_SLOTS = 366;

export function dayOfYearFixed(month: number, day: number): number {
  return LEAP_OFFSETS[month] + day - 1;
}

/**
 * Calendar days per month across the observed span: 31 for a January that
 * appears at all, not the number of its days that happened to be watched.
 *
 * This is the divisor for the monthly pace chart. The alternative, counting only
 * observed days, treats a part-month as a short month and inflates its rate: the
 * first January contributes 18 days and the current month contributes however
 * far through it we are, so both read as busier than they were. Whole calendar
 * months keep the denominator a property of the CALENDAR rather than of when the
 * log happens to start and stop.
 *
 * Leap years are handled by asking the calendar for February's length in each
 * year rather than assuming 28.
 */
export function calendarDaysPerMonth(dates: string[]): number[] {
  const out = Array(12).fill(0) as number[];
  if (!dates.length) return out;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const cur = new Date(first.slice(0, 7) + "-01T00:00:00Z");
  const end = last.slice(0, 7);
  for (let guard = 0; guard < 2000; guard++) {
    const key = cur.toISOString().slice(0, 7);
    const m = cur.getUTCMonth();
    // Day 0 of the next month is the last day of this one.
    out[m] += new Date(Date.UTC(cur.getUTCFullYear(), m + 1, 0)).getUTCDate();
    if (key >= end) break;
    cur.setUTCMonth(m + 1);
  }
  return out;
}

/** Every YYYY-MM from the first to the last watch, with no gaps. */
export function monthSpan(dates: string[]): string[] {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const end = sorted[sorted.length - 1].slice(0, 7);
  const out: string[] = [];
  const cur = new Date(sorted[0].slice(0, 7) + "-01T00:00:00Z");
  for (;;) {
    const key = cur.toISOString().slice(0, 7);
    out.push(key);
    if (key >= end) break;
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/* ------------------------------------------------------------------ sheet era */

/**
 * Whether the data can answer what this watch's rewatch state was.
 *
 * THE definition, for every consumer: the StatBar rate through
 * `computeRewatchShare`, the velocity chart's "not recorded" band, and the
 * rewatch-vs-first-watch rating comparison in the stories. A second copy of this
 * function once lived in `stats.ts` and learned about `returned` while this one
 * did not, so the same page rendered 32.3% and 31.7% side by side. One function,
 * or the page contradicts itself again.
 *
 * The 129 pre-Letterboxd rows carry `rewatch: false` because the Google Sheet
 * had no such column, not because they were first viewings. 6 of the 129 do read
 * true, and all 6 only because `fct_watches` derives the flag as the recorded
 * value OR `is_return`; the sheet itself flagged none. Against 31.7% across the
 * 666 Letterboxd rows, `false` in the sheet era means UNKNOWN, exactly like
 * three-state `liked`, which is the era marker used here per the project
 * invariant in CLAUDE.md.
 *
 * `returned` then rescues the part of that era the data can still see. It says
 * an earlier watch of the same film sits in the dataset, which is an ordinal
 * fact and so era-independent: a sheet-era row that is visibly a return is
 * measurable even though it recorded nothing itself. Only a sheet-era row that
 * is its film's FIRST appearance stays genuinely unmeasurable, because whether
 * it returned to a viewing from before the data begins cannot be recovered.
 * 672 of the 795 rows come out measurable.
 *
 * ⚠️ RAW `liked`, never the recovered `heart`. The heart is recoverable for a
 * sheet-era row whose film was watched again later, and 28 rows come back that
 * way on top of the ones `returned` already admits, but those rows are still
 * sheet-era and still recorded no rewatch flag. Reading `heart` here would add
 * all 28 to the denominator as if they had, which is the same understatement D5
 * already cost this project once.
 */
export function hasKnownRewatchState(w: EnrichedWatch): boolean {
  return w.liked != null || w.returned;
}

/* ------------------------------------------------- significance testing */

/**
 * A plain R² is the WRONG statistic for "does rating vary by month/weekday".
 * Those are cyclic categories, not continuous quantities: regressing rating on a
 * month index would assert December is twelve times January, and would miss any
 * non-monotonic pattern, which is exactly the pattern expected when October is
 * the interesting month. The right test is a one-way ANOVA, and eta² is the
 * direct categorical analogue of R², so it fills the same slot.
 */

/** Lanczos approximation. Only needed for the incomplete beta below. */
function logGamma(x: number): number {
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = C[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += C[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (Lentz). NR in C, 6.4. */
function betacf(a: number, b: number, x: number): number {
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Upper-tail p for an F statistic. Verified against published critical values. */
export function fPValue(F: number, df1: number, df2: number): number {
  if (!(F > 0) || df1 < 1 || df2 < 1) return 1;
  return betai(df2 / 2, df1 / 2, df2 / (df2 + df1 * F));
}

export type Anova = { eta2: number; F: number; df1: number; df2: number; p: number; n: number };

/** One-way ANOVA of a continuous value across categorical groups. */
export function anova(groups: number[][]): Anova | null {
  const used = groups.filter((g) => g.length > 0);
  const k = used.length;
  const n = used.reduce((s, g) => s + g.length, 0);
  if (k < 2 || n <= k) return null;

  const grand = used.reduce((s, g) => s + g.reduce((a, b) => a + b, 0), 0) / n;
  let ssB = 0;
  let ssW = 0;
  for (const g of used) {
    const m = mean(g);
    ssB += g.length * (m - grand) ** 2;
    for (const v of g) ssW += (v - m) ** 2;
  }
  const ssT = ssB + ssW;
  const df1 = k - 1;
  const df2 = n - k;
  // Zero within-group variance makes F undefined rather than infinite.
  if (ssW <= 0) return null;
  const F = ssB / df1 / (ssW / df2);
  return { eta2: ssT > 0 ? ssB / ssT : 0, F, df1, df2, p: fPValue(F, df1, df2), n };
}

export const ALPHA = 0.05;

/**
 * Quotes an effect size ONLY when the test clears alpha: an eta² printed next to
 * a null result invites the reader to treat noise as a finding.
 */
export function anovaCaption(a: Anova | null, unit: string): string {
  if (!a) return "Not enough rated watches to test.";
  const stat = `F(${a.df1}, ${a.df2}) = ${a.F.toFixed(2)}, p = ${
    a.p < 0.001 ? "<0.001" : a.p.toFixed(3)
  }`;
  if (a.p >= ALPHA) {
    return `No significant rating difference by ${unit.toLowerCase()} (${stat}, n = ${a.n}).`;
  }
  return `${unit} explains ${(a.eta2 * 100).toFixed(1)}% of rating variance (eta² = ${a.eta2.toFixed(
    3,
  )}, ${stat}, n = ${a.n}).`;
}

/* ------------------------------------------------------------- box plots */

export type BoxBounds = {
  q1: number;
  med: number;
  q3: number;
  lo: number;
  hi: number;
  outliers: number[];
};

/**
 * Standard Tukey box plot bounds from a sorted array.
 *
 * Whiskers reach the furthest actual value within 1.5 IQR of the box, and
 * anything past that is an outlier. Fixed percentile whiskers (5/95, 10/90) read
 * as a box plot but mean something else, and by construction can never produce
 * an outlier, which is why none were appearing.
 */
export function tukey(sorted: number[]): BoxBounds {
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const fence = 1.5 * (q3 - q1);
  const inliers = sorted.filter((v) => v >= q1 - fence && v <= q3 + fence);
  return {
    q1,
    med,
    q3,
    lo: inliers.length ? inliers[0] : q1,
    hi: inliers.length ? inliers[inliers.length - 1] : q3,
    outliers: sorted.filter((v) => v < q1 - fence || v > q3 + fence),
  };
}
