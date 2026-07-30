// What the viewing did across the years I was in grad school, on a rolling basis
// and against the stretches either side of it.
//
// Reads a raw `Dataset` and needs no store or provider, for the same reason
// `travelStats` does not: the figures are library-wide and a filter that cut them
// would leave the copy quoting a number the reader cannot interpret.
//
// THE COMPARISON THIS MODULE REFUSES TO MAKE is the span against everything
// outside it. That split reports the span rating 5.0 points high, and the figure
// is an artifact: "outside" is 626 watches of which 480 are the high-volume,
// low-rated stretch from 2019 to mid-2022, so it mostly measures the distance
// from that period rather than anything about school. `neighbors` replaces it.
// Against the twelve months on each side the span moves the mean by under a
// point.

import type { Dataset } from "./types";

/**
 * The span, as the owner gave it. Inclusive at both ends.
 *
 * Written down rather than derived, because no column in the data records it.
 * `2025-05-31` is the last day of the span and not the first day after, so every
 * range check below is inclusive on both sides.
 */
export const GRAD_SCHOOL = { start: "2023-08-01", end: "2025-05-31" } as const;

/**
 * Width of the rolling window, in months. TWELVE, AND THE REASON IS LOAD-BEARING.
 *
 * The span is 22 months. A 24-month window is WIDER THAN THE THING IT HAS TO
 * RESOLVE: every window overlapping the span would also carry months from outside
 * it, so the line would be smooth across the span by construction, and its
 * flatness would be a property of the method rather than a fact about the
 * viewing. Flatness a method could not have contradicted is not evidence of
 * anything.
 *
 * Twelve spans the era roughly twice, so a real dip inside it would show. That is
 * the entire basis for reading anything into the line not dipping.
 *
 * DO NOT WIDEN THIS TO SMOOTH THE LINE. It would destroy the finding rather than
 * tidy it. `keeps the window narrower than the era` in the tests fails if this
 * ever reaches the length of the span.
 */
export const TREND_MONTHS = 12;

/** Months since year zero, so two "YYYY-MM" strings compare and subtract. */
export function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

/** The inverse of `monthIndex`, back to "YYYY-MM". */
function monthKey(m: number): string {
  return `${String(Math.floor(m / 12)).padStart(4, "0")}-${String((m % 12) + 1).padStart(2, "0")}`;
}

/** One point on both rolling lines: the window ENDING at this month. */
export type RollingPoint = {
  /** Month index of the window's last month. */
  month: number;
  /** "2023-08". */
  key: string;
  filmsPerMonth: number;
  /** Null only if a whole window held no rated watch, which this log never does. */
  meanRating: number | null;
};

/** A stretch of the calendar summarized on both measures. */
export type Window = {
  label: string;
  start: string;
  end: string;
  watches: number;
  days: number;
  /** Watches per 30 days. */
  per30: number;
  meanRating: number;
  sdRating: number;
};

/** The span measured against one of its neighbors, on both measures. */
export type Contrast = {
  label: string;
  /** Span mean minus the other window's mean, in rating points. Signed. */
  ratingDiff: number;
  ratingZ: number;
  /**
   * Whether the rating difference is indistinguishable from none.
   *
   * LOOKED UP and never written into the copy, so no sentence can go on asserting
   * a gap after the data stops holding one. The prose branches on this.
   */
  ratingIsNoise: boolean;
  /** Span watch rate divided by the other window's. 1.0 is no difference. */
  rateRatio: number;
  rateZ: number;
  volumeIsNoise: boolean;
};

/** What the two rolling lines read at one edge of the span. */
export type Edge = {
  key: string;
  filmsPerMonth: number;
  meanRating: number;
};

export type EraStats = {
  logStart: string;
  logEnd: string;
  /** Length of the span in whole months. 22 today, and the reason the window is 12. */
  eraMonths: number;
  /** The span's own size. Not a comparison, so it is safe to state plainly. */
  span: Window;
  /**
   * The log cut into four stretches in date order: the early years, the twelve
   * months before the span, the span, the twelve months after.
   *
   * This is what replaces the span-against-everything-else split. See the header.
   */
  neighbors: Window[];
  /**
   * Every watch not inside the span.
   *
   * NOT the sum of the other three `neighbors`. Those two flanking windows are
   * deliberately 365 days each so the comparison either side of the span is
   * symmetric, which leaves the tail of the log past the last of them uncovered.
   * The copy quotes this when it explains what the discarded 5.0 point figure was
   * measuring against, and that figure was computed against ALL of them.
   */
  outsideWatches: number;
  /** The span against the year before it, and against the year after. */
  vsBefore: Contrast;
  vsAfter: Contrast;
  /** Both rolling lines, one entry per month a window can close on. */
  series: RollingPoint[];
  /** What each line reads as the span opens and as it closes. */
  opens: Edge;
  closes: Edge;
  /** The lowest and highest the volume line goes strictly inside the span. */
  spanVolumeRange: { low: Edge; high: Edge };
  /** Mean rating per calendar year, in order. The clearest look at the climb. */
  yearlyMeans: { year: number; n: number; mean: number }[];
};

const DAY_MS = 86_400_000;

function daysInclusive(start: string, end: string): number {
  return Math.floor((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
}

function shiftDays(date: string, delta: number): string {
  return new Date(Date.parse(date) + delta * DAY_MS).toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function summarize(
  rows: { date: string; rating: number | null }[],
  label: string,
  start: string,
  end: string,
): Window {
  const hit = rows.filter((r) => r.date >= start && r.date <= end);
  const rated = hit.map((r) => r.rating).filter((r): r is number => r != null);
  const m = mean(rated);
  // Sample standard deviation: these are a sample of the viewing I might have
  // done in the stretch, not the population of it.
  const sd =
    rated.length < 2
      ? 0
      : Math.sqrt(rated.reduce((a, r) => a + (r - m) ** 2, 0) / (rated.length - 1));
  const days = Math.max(1, daysInclusive(start, end));
  return {
    label,
    start,
    end,
    watches: hit.length,
    days,
    per30: (hit.length / days) * 30,
    meanRating: m,
    sdRating: sd,
  };
}

/**
 * The span against one neighbor, on both measures.
 *
 * The rating uses a two-sample z on the difference of means. The volume uses the
 * LOG OF THE RATE RATIO rather than a difference of rates, because watch counts
 * are counts over unequal exposures and the standard error of a rate difference
 * is not the honest statistic for them. `sqrt(1/k1 + 1/k2)` is the usual Poisson
 * approximation to the standard error of a log rate ratio.
 */
function contrast(span: Window, other: Window, label: string): Contrast {
  const ratingSe = Math.sqrt(
    span.sdRating ** 2 / Math.max(1, span.watches) +
      other.sdRating ** 2 / Math.max(1, other.watches),
  );
  const ratingDiff = span.meanRating - other.meanRating;
  const ratingZ = ratingSe === 0 ? 0 : ratingDiff / ratingSe;

  const rateRatio = other.per30 === 0 ? 0 : span.per30 / other.per30;
  const rateSe = Math.sqrt(1 / Math.max(1, span.watches) + 1 / Math.max(1, other.watches));
  const rateZ = rateRatio <= 0 ? 0 : Math.log(rateRatio) / rateSe;

  return {
    label,
    ratingDiff,
    ratingZ,
    ratingIsNoise: Math.abs(ratingZ) < 1.96,
    rateRatio,
    rateZ,
    volumeIsNoise: Math.abs(rateZ) < 1.96,
  };
}

/**
 * Both rolling lines over the whole log, at the given window width in months.
 *
 * Exported so a test can run it at other widths and show what widening costs.
 *
 * A point sits at the LAST month of its window, which is the ordinary reading of
 * a trailing average and is what the caption says. It also means the early points
 * inside the span still carry months from before it: the window is wholly inside
 * the span only from its twelfth month on.
 */
export function rollingSeries(
  rows: { date: string; rating: number | null }[],
  width: number,
): RollingPoint[] {
  if (rows.length === 0) return [];
  const byMonth = new Map<number, { date: string; rating: number | null }[]>();
  for (const r of rows) {
    const m = monthIndex(r.date);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const first = monthIndex(rows[0].date);
  const last = monthIndex(rows[rows.length - 1].date);

  const out: RollingPoint[] = [];
  for (let end = first + width - 1; end <= last; end++) {
    const win: { date: string; rating: number | null }[] = [];
    for (let m = end - width + 1; m <= end; m++) win.push(...(byMonth.get(m) ?? []));
    const rated = win.map((r) => r.rating).filter((r): r is number => r != null);
    out.push({
      month: end,
      key: monthKey(end),
      // Divided by the window width, not by the number of months that held a
      // watch: a month with nothing in it is a real zero, not a gap.
      filmsPerMonth: win.length / width,
      meanRating: rated.length === 0 ? null : mean(rated),
    });
  }
  return out;
}

const asEdge = (p: RollingPoint): Edge => ({
  key: p.key,
  filmsPerMonth: p.filmsPerMonth,
  meanRating: p.meanRating ?? 0,
});

/** The series point at a given month, or the nearest earlier one. */
function readAt(series: RollingPoint[], key: string): Edge {
  const m = monthIndex(key);
  return asEdge([...series].reverse().find((p) => p.month <= m) ?? series[0]);
}

export function computeEraStats(data: Dataset): EraStats {
  const rows = data.watches
    .map((w) => ({ date: w.date, rating: w.rating }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const logStart = rows[0].date;
  const logEnd = rows[rows.length - 1].date;

  const span = summarize(rows, "in school", GRAD_SCHOOL.start, GRAD_SCHOOL.end);
  const yearBefore = shiftDays(GRAD_SCHOOL.start, -365);
  const before = summarize(rows, "12 months before", yearBefore, shiftDays(GRAD_SCHOOL.start, -1));
  const after = summarize(
    rows,
    "12 months after",
    shiftDays(GRAD_SCHOOL.end, 1),
    shiftDays(GRAD_SCHOOL.end, 365),
  );
  const early = summarize(rows, "the early years", logStart, shiftDays(yearBefore, -1));

  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.rating == null) continue;
    const y = Number(r.date.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), r.rating]);
  }
  const yearlyMeans = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rs]) => ({ year, n: rs.length, mean: mean(rs) }));

  const series = rollingSeries(rows, TREND_MONTHS);

  const inside = series.filter(
    (p) => p.month >= monthIndex(GRAD_SCHOOL.start) && p.month <= monthIndex(GRAD_SCHOOL.end),
  );
  const byVolume = [...inside].sort((a, b) => a.filmsPerMonth - b.filmsPerMonth);

  return {
    logStart,
    logEnd,
    eraMonths: monthIndex(GRAD_SCHOOL.end) - monthIndex(GRAD_SCHOOL.start) + 1,
    span,
    neighbors: [early, before, span, after],
    outsideWatches: rows.length - span.watches,
    vsBefore: contrast(span, before, before.label),
    vsAfter: contrast(span, after, after.label),
    series,
    opens: readAt(series, GRAD_SCHOOL.start),
    closes: readAt(series, GRAD_SCHOOL.end),
    spanVolumeRange: {
      low: asEdge(byVolume[0]),
      high: asEdge(byVolume[byVolume.length - 1]),
    },
    yearlyMeans,
  };
}

/** "Aug 2023". The charts print years, so this is for the prose. */
export function monthLabel(iso: string): string {
  return new Date(iso.slice(0, 7) + "-01T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
