// What the numbers do across the years I was in grad school, and what they do on
// either side of it.
//
// Reads a raw `Dataset` and needs no store or provider, for the same reason
// `travelStats` does not: the figures are library-wide and a filter that cut them
// would leave the copy quoting a number the reader cannot interpret.
//
// The adjacent windows are not decoration. The in-span mean beats the whole
// outside by five points, and the outside is seven and a half years long, so
// "outside" is mostly a period that predates the span by years. Comparing the era
// against the twelve months on each side of it is what turns a real gap into a
// visibly confounded one, and this module computes both so the copy cannot quote
// the flattering figure alone.

import type { Dataset } from "./types";

/**
 * The span, as the owner gave it. Inclusive at both ends.
 *
 * Written down rather than derived, because no column in the data records it.
 * `2025-05-31` is the last day of the span and not the first day after, so every
 * range check below is inclusive on both sides.
 */
export const GRAD_SCHOOL = { start: "2023-08-01", end: "2025-05-31" } as const;

/** One side of the split. Both sides carry the same fields, computed one way. */
export type EraSplit = {
  /** Calendar days, inclusive, clipped to the days the log actually covers. */
  days: number;
  watches: number;
  /** Watches per 30 days. The pace figure, and it goes the unflattering way. */
  per30: number;
  ratingN: number;
  meanRating: number;
  sdRating: number;
  seRating: number;
};

/** A mean over one stretch of the calendar, for the confound check. */
export type Window = {
  label: string;
  start: string;
  end: string;
  watches: number;
  meanRating: number;
};

export type EraStats = {
  /** First and last watch date in the log, which bounds every day count here. */
  logStart: string;
  logEnd: string;
  inSpan: EraSplit;
  outside: EraSplit;
  /** In-span mean minus outside mean, in rating points. Signed. */
  ratingDiff: number;
  ratingDiffSe: number;
  /** The gap in standard errors. Around 4.6 today, so this one is not noise. */
  ratingDiffZ: number;
  /**
   * Whether the gap is indistinguishable from no gap.
   *
   * Looked up rather than asserted in the copy, the same way `travelStats` does
   * it: the travel finding's answer is yes and this one's is no, and a sentence
   * that hardcoded either would go on saying it after the data changed.
   */
  ratingGapIsNoise: boolean;
  /** Mean rating per calendar year, in order. The climb the caveat turns on. */
  yearlyMeans: { year: number; n: number; mean: number }[];
  /**
   * The log cut into four stretches in date order: the early years, the twelve
   * months before the span, the span, and the twelve months after.
   *
   * The confound, in four numbers. If school were doing the work, the third
   * would step up from the second and the fourth would step back down. It does
   * neither, and the first is where the whole five point gap actually comes
   * from.
   */
  neighbors: Window[];
  /** Watch counts for the months either side of the start date. */
  boundaryMonths: { month: string; watches: number }[];
  /** Every watch as a point on the strip. Sorted by date. */
  points: { date: string; rating: number | null }[];
  /**
   * Trailing mean rating, one entry per rated watch in date order.
   *
   * A trailing window over WATCHES and not over days, because the pace is not
   * constant: a fixed number of days holds 4 watches in one month and 12 in
   * another, so a day window would swing on how much I watched rather than on how
   * I rated. `TREND_WINDOW` watches is about four months at the log's average
   * pace and is the same amount of evidence at every point on the line.
   */
  trend: { date: string; mean: number }[];
};

/** Watches averaged into each point of the trailing trend line. */
export const TREND_WINDOW = 40;

const DAY_MS = 86_400_000;

/** Inclusive day count between two ISO dates. */
function daysInclusive(start: string, end: string): number {
  return Math.floor((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
}

function inSpan(date: string): boolean {
  return date >= GRAD_SCHOOL.start && date <= GRAD_SCHOOL.end;
}

function split(days: number, ratings: number[], watches: number): EraSplit {
  const n = ratings.length;
  const mean = n === 0 ? 0 : ratings.reduce((a, b) => a + b, 0) / n;
  // Sample standard deviation: these watches are a sample of the viewing I might
  // have done in the period, not the population of it.
  const sd = n < 2 ? 0 : Math.sqrt(ratings.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1));
  return {
    days,
    watches,
    per30: days === 0 ? 0 : (watches / days) * 30,
    ratingN: n,
    meanRating: mean,
    sdRating: sd,
    seRating: n === 0 ? 0 : sd / Math.sqrt(n),
  };
}

/** Mean rating over an inclusive date range, for one row of the confound check. */
function windowMean(
  rows: { date: string; rating: number | null }[],
  label: string,
  start: string,
  end: string,
): Window {
  const hit = rows.filter((r) => r.date >= start && r.date <= end);
  const rated = hit.map((r) => r.rating).filter((r): r is number => r != null);
  return {
    label,
    start,
    end,
    watches: hit.length,
    meanRating: rated.length === 0 ? 0 : rated.reduce((a, b) => a + b, 0) / rated.length,
  };
}

/** Shift an ISO date by whole days, staying in UTC. */
function shiftDays(date: string, delta: number): string {
  return new Date(Date.parse(date) + delta * DAY_MS).toISOString().slice(0, 10);
}

export function computeEraStats(data: Dataset): EraStats {
  const points = data.watches
    .map((w) => ({ date: w.date, rating: w.rating }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const logStart = points[0].date;
  const logEnd = points[points.length - 1].date;

  // Clipped to the log rather than taken from the constants. The span sits well
  // inside the log today, so the clip changes nothing, but a day count that ran
  // past either end would be counting calendar the data cannot speak for.
  const spanStart = GRAD_SCHOOL.start > logStart ? GRAD_SCHOOL.start : logStart;
  const spanEnd = GRAD_SCHOOL.end < logEnd ? GRAD_SCHOOL.end : logEnd;
  const spanDays = Math.max(0, daysInclusive(spanStart, spanEnd));
  const outsideDays = daysInclusive(logStart, logEnd) - spanDays;

  const rated = (rows: typeof points) =>
    rows.map((r) => r.rating).filter((r): r is number => r != null);
  const within = points.filter((p) => inSpan(p.date));
  const without = points.filter((p) => !inSpan(p.date));

  const inside = split(spanDays, rated(within), within.length);
  const outside = split(outsideDays, rated(without), without.length);

  const ratingDiff = inside.meanRating - outside.meanRating;
  const ratingDiffSe = Math.sqrt(inside.seRating ** 2 + outside.seRating ** 2);

  const byYear = new Map<number, number[]>();
  for (const p of points) {
    if (p.rating == null) continue;
    const y = Number(p.date.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), p.rating]);
  }
  const yearlyMeans = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rs]) => ({ year, n: rs.length, mean: rs.reduce((a, b) => a + b, 0) / rs.length }));

  const byMonth = new Map<string, number>();
  for (const p of points) {
    const m = p.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  // Three months on each side of the start. Wide enough to show there is no step
  // at the boundary and narrow enough that a reader can check it by eye.
  const startMonth = GRAD_SCHOOL.start.slice(0, 7);
  const boundaryMonths = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([m]) => Math.abs(monthIndex(m) - monthIndex(startMonth)) <= 3)
    .map(([month, watches]) => ({ month, watches }));

  const yearBefore = shiftDays(GRAD_SCHOOL.start, -365);
  const neighbors = [
    windowMean(points, "the early years", logStart, shiftDays(yearBefore, -1)),
    windowMean(points, "12 months before", yearBefore, shiftDays(GRAD_SCHOOL.start, -1)),
    windowMean(points, "in school", GRAD_SCHOOL.start, GRAD_SCHOOL.end),
    windowMean(
      points,
      "12 months after",
      shiftDays(GRAD_SCHOOL.end, 1),
      shiftDays(GRAD_SCHOOL.end, 365),
    ),
  ];

  const trend: { date: string; mean: number }[] = [];
  const ratedPoints = points.filter((p): p is { date: string; rating: number } => p.rating != null);
  // Starts at the WINDOWth watch, not the first. A trailing mean over three
  // watches is not the same statistic as one over forty, and drawing both on one
  // line would put the noisiest part of it at the left edge where a reader reads
  // the trend's starting level off it.
  for (let i = TREND_WINDOW - 1; i < ratedPoints.length; i++) {
    const win = ratedPoints.slice(i - TREND_WINDOW + 1, i + 1);
    trend.push({
      date: ratedPoints[i].date,
      mean: win.reduce((a, p) => a + p.rating, 0) / TREND_WINDOW,
    });
  }

  return {
    logStart,
    logEnd,
    inSpan: inside,
    outside,
    ratingDiff,
    ratingDiffSe,
    ratingDiffZ: ratingDiffSe === 0 ? 0 : ratingDiff / ratingDiffSe,
    ratingGapIsNoise: Math.abs(ratingDiff) <= 1.96 * ratingDiffSe,
    yearlyMeans,
    neighbors,
    boundaryMonths,
    points,
    trend,
  };
}

/** Months since 1970, so two "YYYY-MM" strings can be compared by distance. */
function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
}

/** "Aug 2023". The strip's own axis prints years, so this is for the prose. */
export function monthLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
