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
 * Window for the PACE line, in months. Twelve, and the reason is load-bearing.
 *
 * Films per month is a rate over time, so its window has to be a span of time.
 * There is no watch-count version of it: a fixed number of watches covers however
 * long it covers, which is the quantity the line is trying to report.
 *
 * TWELVE AND NOT TWENTY-FOUR. The span is 22 months, so a 24-month window is
 * WIDER THAN THE THING IT HAS TO RESOLVE: every window touching the span would
 * also carry months from outside it, the line would come out smooth there by
 * construction, and flatness a method could not have contradicted is not evidence
 * of anything. Twelve covers the span about twice, so a real dip inside it would
 * show.
 *
 * DO NOT WIDEN THIS TO SMOOTH THE LINE. It would destroy the finding rather than
 * tidy it. `keeps the pace window narrower than the era` fails if it ever reaches
 * the length of the span.
 */
export const PACE_MONTHS = 12;

/**
 * Window for the RATING line, in WATCHES rather than in time.
 *
 * IN WATCHES, and that half is not negotiable. The pace is not constant: a fixed
 * span of days holds four watches in one month and twelve in another, so a
 * time-windowed mean rating would swing on HOW MUCH I watched rather than on how
 * I rated it, which is precisely the confusion this section exists to avoid. Ten
 * watches is the same amount of evidence at every point on the line.
 *
 * TEN IS A DELIBERATE TRADE, made with the cost known. It was forty, and forty
 * bought a headline: the line came back to where it entered the span, 0.8 points
 * net, quieter than 92% of comparable stretches. Ten does not. It travels 4.0
 * points net and lands around the 30th percentile, which is middling. The owner
 * chose the livelier line and gave up the finding, so the copy states a middling
 * stretch rather than a still one, and `ranks the span as a middling stretch`
 * pins that down.
 *
 * WHAT TEN COSTS, measured against the shipped payload:
 *
 * - a window covers about 1.3 months at the span's pace, 169 watches over 22
 *   months, and `ratingWindowMonths` reports the real range for windows closing
 *   inside the span
 * - one film moves the line by up to 6 points, because a mean over ten shifts by
 *   a tenth of the gap between the watch arriving and the watch leaving
 *
 * So this is a LIGHTLY SMOOTHED SERIES AND NOT A TREND. Read it as movement.
 * Any claim about its level at a point is a claim about ten films.
 *
 * It still resolves the era, which is the one property the section needs from it:
 * `ratingWindowMonths` is far short of the 22 months the span runs, so a dip
 * inside the span could show if there were one.
 */
export const RATING_WATCHES = 10;

/** Months since year zero, so two "YYYY-MM" strings compare and subtract. */
export function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

/**
 * A date as a FRACTIONAL month index, which is the x unit both lines share.
 *
 * The pace line is indexed by whole months and the rating line by the date of a
 * watch, so neither one's natural x works for the other. Putting both on
 * fractional months is what lets one scale, and therefore one band, serve the two
 * charts: a reader comparing them has to be able to trust that the shading falls
 * in the same place, and the cheapest way to earn that is for there to be exactly
 * one copy of the geometry.
 */
export function timeAt(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return monthIndex(iso) + (d.getUTCDate() - 1) / daysInMonth;
}

/** The inverse of `monthIndex`, back to "YYYY-MM". */
function monthKey(m: number): string {
  return `${String(Math.floor(m / 12)).padStart(4, "0")}-${String((m % 12) + 1).padStart(2, "0")}`;
}

/** One point on the pace line: the `PACE_MONTHS` window ending at this month. */
export type PacePoint = {
  /** Fractional month index, the x unit shared with the rating line. */
  time: number;
  /** Month index of the window's last month. */
  month: number;
  /** "2023-08". */
  key: string;
  filmsPerMonth: number;
};

/** One point on the rating line: the `RATING_WATCHES` window ending at this watch. */
export type RatingPoint = {
  /** Fractional month index, the x unit shared with the pace line. */
  time: number;
  /** Date of the window's last watch. */
  date: string;
  mean: number;
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

/** What the two lines read at one edge of the span, or at one point of interest. */
export type Edge = {
  /** "2023-08" for a pace reading, a full date for a rating one. */
  key: string;
  filmsPerMonth: number;
  meanRating: number;
};

/**
 * How much the rating line moves across the span, RANKED against every other
 * stretch of the same length in the log.
 *
 * The rank is the point. A ten-watch window wanders visibly everywhere, so "it is
 * flat across the span" would be an eyeball claim and a false one. What is
 * checkable is where the span's movement sits among comparable stretches, so the
 * section quotes the percentile rather than asserting the shape.
 *
 * At ten the answer is "middling", not "still". That is a real answer and the
 * copy gives it as one: the rank locates the span, it does not vindicate it.
 */
export type Stretch = {
  /** Highest minus lowest inside the span. */
  swing: number;
  /** Absolute difference between the value entering and the value leaving. */
  netDelta: number;
  /** Where `swing` falls among all same-length stretches, 0 to 100. Lower is calmer. */
  swingPercentile: number;
  /** Where `netDelta` falls among all same-length stretches, 0 to 100. */
  netPercentile: number;
  /** How many same-length stretches the two percentiles are computed against. */
  comparable: number;
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
  /** Films per month, one entry per month a `PACE_MONTHS` window can close on. */
  pace: PacePoint[];
  /** Mean rating, one entry per watch a `RATING_WATCHES` window can close on. */
  rating: RatingPoint[];
  /** What each line reads as the span opens and as it closes. */
  opens: Edge;
  closes: Edge;
  /** The lowest and highest the pace line goes inside the span. */
  spanPaceRange: { low: Edge; high: Edge };
  /** How still the rating line is across the span, against every comparable stretch. */
  ratingStretch: Stretch;
  /**
   * How many months a `RATING_WATCHES` window actually covers, for the windows
   * that close inside the span. Derived, never written down: the copy quotes it
   * to show the window is short enough to resolve the era, and that sentence was
   * wrong for months after the window width changed underneath a hardcoded one.
   */
  ratingWindowMonths: { low: number; high: number };
  /** Mean rating per calendar year, in order. The clearest look at the climb. */
  yearlyMeans: { year: number; n: number; mean: number }[];
};

const DAY_MS = 86_400_000;

/**
 * Days in an average Gregorian month, 365.2425 / 12. Only ever used to turn a
 * count of days into a readable number of months, never to index anything.
 */
const AVG_MONTH_DAYS = 30.436875;

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
 * The pace line over the whole log, at the given window width in months.
 *
 * Exported so a test can run it at other widths and show what widening costs.
 *
 * A point sits at the LAST month of its window, which is the ordinary reading of
 * a trailing average and is what the caption says. It also means the early points
 * inside the span still carry months from before it: the window is wholly inside
 * the span only from its twelfth month on.
 */
export function paceSeries(
  rows: { date: string; rating: number | null }[],
  width: number,
): PacePoint[] {
  if (rows.length === 0) return [];
  const byMonth = new Map<number, number>();
  for (const r of rows) {
    const m = monthIndex(r.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const first = monthIndex(rows[0].date);
  const last = monthIndex(rows[rows.length - 1].date);

  const out: PacePoint[] = [];
  for (let end = first + width - 1; end <= last; end++) {
    let n = 0;
    for (let m = end - width + 1; m <= end; m++) n += byMonth.get(m) ?? 0;
    out.push({
      time: end,
      month: end,
      key: monthKey(end),
      // Divided by the window width, not by the number of months that held a
      // watch: a month with nothing in it is a real zero, not a gap.
      filmsPerMonth: n / width,
    });
  }
  return out;
}

/**
 * The rating line over the whole log, at the given window width in WATCHES.
 *
 * Starts at the `width`th rated watch rather than the first. A trailing mean over
 * three watches is not the same statistic as one over forty, and drawing both on
 * one line would put the noisiest part of it at the left edge, exactly where a
 * reader reads off the line's starting level.
 */
export function ratingTrend(
  rows: { date: string; rating: number | null }[],
  width: number,
): RatingPoint[] {
  const rated = rows.filter((r): r is { date: string; rating: number } => r.rating != null);
  const out: RatingPoint[] = [];
  for (let i = width - 1; i < rated.length; i++) {
    const win = rated.slice(i - width + 1, i + 1);
    out.push({
      time: timeAt(rated[i].date),
      date: rated[i].date,
      mean: mean(win.map((r) => r.rating)),
    });
  }
  return out;
}

/**
 * How still a line is over one stretch, ranked against every stretch of the same
 * length elsewhere in the series.
 *
 * The comparison stretches step a month at a time and overlap heavily, so these
 * are not independent samples and the percentile is a descriptive rank rather
 * than a p-value. That is all the copy claims of it: the era is calmer than most
 * comparable stretches, not significantly calmer.
 */
function rankStretch(
  points: { time: number; mean: number }[],
  from: number,
  to: number,
): Stretch {
  const width = to - from;
  const measure = (a: number, b: number) => {
    const seg = points.filter((p) => p.time >= a && p.time <= b);
    if (seg.length < 6) return null;
    const vals = seg.map((p) => p.mean);
    return {
      swing: Math.max(...vals) - Math.min(...vals),
      netDelta: Math.abs(seg[seg.length - 1].mean - seg[0].mean),
    };
  };
  const here = measure(from, to) ?? { swing: 0, netDelta: 0 };

  const all: { swing: number; netDelta: number }[] = [];
  const last = points[points.length - 1].time;
  for (let a = points[0].time; a + width <= last; a += 1) {
    const m = measure(a, a + width);
    if (m) all.push(m);
  }
  const pct = (v: number, pick: (m: { swing: number; netDelta: number }) => number) =>
    all.length === 0 ? 0 : (all.filter((m) => pick(m) < v).length / all.length) * 100;

  return {
    swing: here.swing,
    netDelta: here.netDelta,
    swingPercentile: pct(here.swing, (m) => m.swing),
    netPercentile: pct(here.netDelta, (m) => m.netDelta),
    comparable: all.length,
  };
}

/** The last point of a series at or before a given time. */
function lastAtOrBefore<T extends { time: number }>(series: T[], t: number): T {
  let hit = series[0];
  for (const p of series) {
    if (p.time > t) break;
    hit = p;
  }
  return hit;
}

/**
 * What both lines read at one moment.
 *
 * The two are sampled separately because they are indexed differently: the pace
 * line has a point per month and the rating line a point per watch, so "the value
 * as the span opens" is a different lookup on each.
 */
function readAt(pace: PacePoint[], rating: RatingPoint[], date: string): Edge {
  const t = timeAt(date);
  const p = lastAtOrBefore(pace, t);
  const r = lastAtOrBefore(rating, t);
  return { key: p.key, filmsPerMonth: p.filmsPerMonth, meanRating: r.mean };
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

  const pace = paceSeries(rows, PACE_MONTHS);
  const rating = ratingTrend(rows, RATING_WATCHES);

  // What a rating window is worth in months, for the windows closing inside the
  // span. Measured off the rated rows rather than off `rating`, because a point
  // there carries only the date its window CLOSES on and this needs both ends.
  const rated = rows.filter((r) => r.rating != null);
  const windowMonths: number[] = [];
  for (let i = RATING_WATCHES - 1; i < rated.length; i++) {
    const close = rated[i].date;
    if (close < GRAD_SCHOOL.start || close > GRAD_SCHOOL.end) continue;
    const open = rated[i - RATING_WATCHES + 1].date;
    windowMonths.push((Date.parse(close) - Date.parse(open)) / DAY_MS / AVG_MONTH_DAYS);
  }

  const insidePace = pace.filter(
    (p) => p.month >= monthIndex(GRAD_SCHOOL.start) && p.month <= monthIndex(GRAD_SCHOOL.end),
  );
  const byPace = [...insidePace].sort((a, b) => a.filmsPerMonth - b.filmsPerMonth);
  const paceEdge = (p: PacePoint): Edge => ({
    key: p.key,
    filmsPerMonth: p.filmsPerMonth,
    meanRating: 0,
  });

  return {
    logStart,
    logEnd,
    eraMonths: monthIndex(GRAD_SCHOOL.end) - monthIndex(GRAD_SCHOOL.start) + 1,
    span,
    neighbors: [early, before, span, after],
    outsideWatches: rows.length - span.watches,
    vsBefore: contrast(span, before, before.label),
    vsAfter: contrast(span, after, after.label),
    pace,
    rating,
    opens: readAt(pace, rating, GRAD_SCHOOL.start),
    closes: readAt(pace, rating, GRAD_SCHOOL.end),
    spanPaceRange: {
      low: paceEdge(byPace[0]),
      high: paceEdge(byPace[byPace.length - 1]),
    },
    ratingWindowMonths: {
      low: Math.min(...windowMonths),
      high: Math.max(...windowMonths),
    },
    ratingStretch: rankStretch(
      rating,
      timeAt(GRAD_SCHOOL.start),
      timeAt(GRAD_SCHOOL.end),
    ),
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
