// What a day in the air did to the viewing, measured against every other day.
//
// One module rather than a computation inside each prototype, because three
// presentations of one finding have to be three presentations of the SAME
// NUMBERS. A prototype that recomputed its own mean would let the page show two
// answers and make the review a comparison of arithmetic instead of a comparison
// of charts.
//
// Reads a raw `Dataset` and not `EnrichedWatch[]`, so it needs no store and no
// provider. That also means the figures are LIBRARY-WIDE and no filter narrows
// them: at n=21 travel watches, filtering to one year would leave a prototype
// captioned with a number no reader could interpret, and the three panels would
// stop agreeing with each other.

import { TRAVEL_DAYS, type TravelLeg } from "./travel";
import type { Dataset } from "./types";

/** A film as one of these charts needs it: something to name and a rating. */
export type TravelFilm = {
  tmdb_id: number;
  title: string;
  year: number | null;
  rating: number | null;
};

/** One day in the air, with the films watched on it. */
export type TravelDay = {
  date: string;
  leg: TravelLeg;
  films: TravelFilm[];
};

/** A run of travel days close enough together to be one journey. */
export type TravelTrip = {
  /** "September 2019". Derived from the first day, not written down. */
  label: string;
  days: TravelDay[];
  watches: number;
};

/**
 * One side of the comparison. Both sides carry the same fields so a chart can
 * draw them from one code path and cannot accidentally measure the two
 * differently.
 */
export type TravelSplit = {
  days: number;
  watches: number;
  filmsPerDay: number;
  multiFilmDays: number;
  /** Share of this side's days holding more than one film, 0 to 1. */
  multiFilmShare: number;
  /** Watches carrying a rating. Equal to `watches` today; not assumed to be. */
  ratingN: number;
  meanRating: number;
  medianRating: number;
  /** Standard error of the mean, which is the figure the null result turns on. */
  seRating: number;
};

export type TravelStats = {
  travel: TravelSplit;
  ordinary: TravelSplit;
  /** Travel films per day divided by ordinary films per day. */
  filmsPerDayRatio: number;
  /** How much likelier a travel day is to hold more than one film. */
  multiFilmRatio: number;
  /** Travel mean minus ordinary mean, in rating points. Signed. */
  ratingDiff: number;
  ratingDiffSe: number;
  /** 95% interval on `ratingDiff`, normal approximation. */
  ratingDiffCi: [number, number];
  /**
   * Whether the rating gap is indistinguishable from no gap at all.
   *
   * LOOKED UP, not written into the copy, for the same reason `computeBinges`
   * asks whether its peak day was a flight instead of stating it: the answer
   * moves with the data, and a sentence that hardcoded "ratings do not move"
   * would go on saying it after the data stopped agreeing. Every prototype that
   * prints a rating reads this and says so.
   */
  ratingGapIsNoise: boolean;
  /** The ten travel days, in date order. */
  days: TravelDay[];
  trips: TravelTrip[];
  /** Rating domain across the WHOLE library, for any ramp drawn from a rating. */
  ratingDomain: [number, number];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Days apart at which two travel dates stop being one journey.
 *
 * Not tuned. The widest gap inside a trip is the 7 days of the two undirected
 * pairs, and the narrowest gap between trips is the 19 days from 2019-09-24 to
 * 2019-10-13, so anything from 8 to 18 splits these dates identically. 14 sits
 * in the middle of that range, which is the most a threshold can do to say it is
 * not fitted to the data. `tripsSplitCleanly` in the tests asserts the margin
 * still exists rather than trusting this sentence.
 */
export const TRIP_GAP_DAYS = 14;

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function summarize(dayCounts: number[], ratings: number[]): TravelSplit {
  const days = dayCounts.length;
  const watches = dayCounts.reduce((a, b) => a + b, 0);
  const multiFilmDays = dayCounts.filter((n) => n > 1).length;

  const sorted = [...ratings].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n === 0 ? 0 : sorted.reduce((a, b) => a + b, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n === 0 ? 0 : n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  // Sample standard deviation. The 21 travel watches are a sample of the flights
  // I might take, not the population of them, so the denominator is n-1.
  const sd = n < 2 ? 0 : Math.sqrt(sorted.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1));

  return {
    days,
    watches,
    filmsPerDay: days === 0 ? 0 : watches / days,
    multiFilmDays,
    multiFilmShare: days === 0 ? 0 : multiFilmDays / days,
    ratingN: n,
    meanRating: mean,
    medianRating: median,
    seRating: n === 0 ? 0 : sd / Math.sqrt(n),
  };
}

/**
 * Everything the three travel prototypes draw, from the shipped payload.
 *
 * The two sides are DISJOINT: a travel day is never also counted as an ordinary
 * one. Worth saying because the obvious slip is to compare the flights against
 * the whole log, which puts the 10 busiest-in-kind days on both sides of the
 * ratio and drags the baseline toward the thing being measured.
 *
 * Days are days WITH A WATCH, on both sides. The log has no rows for a day
 * nobody watched anything, so an ordinary "day" here is a viewing day, and the
 * films-per-day figures are conditional on having watched at all. That is the
 * comparison the reader wants anyway: whether a flight day holds more films than
 * a normal viewing day, not whether it holds more than an average calendar day.
 */
export function computeTravelStats(data: Dataset): TravelStats {
  const filmById = new Map(data.films.map((f) => [f.tmdb_id, f]));

  const byDate = new Map<string, TravelFilm[]>();
  for (const w of data.watches) {
    const film = filmById.get(w.tmdb_id);
    const list = byDate.get(w.date) ?? [];
    list.push({
      tmdb_id: w.tmdb_id,
      // A watch whose film is missing from `films` would be a broken export, not
      // a film without a name, so it gets a visible placeholder rather than
      // being dropped from a count.
      title: film?.title ?? `#${w.tmdb_id}`,
      year: film?.year ?? null,
      rating: w.rating,
    });
    byDate.set(w.date, list);
  }

  const travelDays: TravelDay[] = Object.entries(TRAVEL_DAYS)
    .filter(([date]) => byDate.has(date))
    .map(([date, leg]) => ({ date, leg, films: byDate.get(date)! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const travelRatings: number[] = [];
  for (const d of travelDays) {
    for (const f of d.films) if (f.rating != null) travelRatings.push(f.rating);
  }

  const ordinaryCounts: number[] = [];
  const ordinaryRatings: number[] = [];
  for (const [date, films] of byDate) {
    if (TRAVEL_DAYS[date]) continue;
    ordinaryCounts.push(films.length);
    for (const f of films) if (f.rating != null) ordinaryRatings.push(f.rating);
  }

  const travel = summarize(
    travelDays.map((d) => d.films.length),
    travelRatings,
  );
  const ordinary = summarize(ordinaryCounts, ordinaryRatings);

  const ratingDiff = travel.meanRating - ordinary.meanRating;
  const ratingDiffSe = Math.sqrt(travel.seRating ** 2 + ordinary.seRating ** 2);
  // Normal approximation rather than a t interval on ~21 degrees of freedom,
  // which makes this interval slightly NARROWER than the honest one. That only
  // ever strengthens `ratingGapIsNoise`: a gap the narrow interval already fails
  // to separate from zero cannot be separated by a wider one.
  const half = 1.96 * ratingDiffSe;
  const ratingDiffCi: [number, number] = [ratingDiff - half, ratingDiff + half];

  const trips: TravelTrip[] = [];
  for (const day of travelDays) {
    const open = trips[trips.length - 1];
    const last = open?.days[open.days.length - 1];
    if (open && last && daysBetween(last.date, day.date) <= TRIP_GAP_DAYS) {
      open.days.push(day);
      open.watches += day.films.length;
      continue;
    }
    const d = new Date(day.date + "T00:00:00Z");
    trips.push({
      label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      days: [day],
      watches: day.films.length,
    });
  }

  const allRatings = data.watches.map((w) => w.rating).filter((r): r is number => r != null);

  return {
    travel,
    ordinary,
    filmsPerDayRatio: ordinary.filmsPerDay === 0 ? 0 : travel.filmsPerDay / ordinary.filmsPerDay,
    multiFilmRatio:
      ordinary.multiFilmShare === 0 ? 0 : travel.multiFilmShare / ordinary.multiFilmShare,
    ratingDiff,
    ratingDiffSe,
    ratingDiffCi,
    ratingGapIsNoise: ratingDiffCi[0] <= 0 && ratingDiffCi[1] >= 0,
    days: travelDays,
    trips,
    ratingDomain: [Math.min(...allRatings), Math.max(...allRatings)],
  };
}

/** "1.9x". One decimal, because the second one is not knowable at n=21. */
export function ratioLabel(r: number): string {
  return `${r.toFixed(1)}x`;
}

/** "71.9". Ratings are 0-100, and one decimal is all 21 watches support. */
export function ratingLabel(r: number): string {
  return r.toFixed(1);
}

/** "−1.6" / "+1.6" / "0.0", with a true minus sign to match `deltaLabel`. */
export function signedLabel(v: number): string {
  const s = Math.abs(v).toFixed(1);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
