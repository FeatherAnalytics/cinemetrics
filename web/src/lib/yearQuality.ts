// Pure helpers behind the release-year charts, which ask what year has the best
// movies.
//
// The x axis is the FILM'S release year — `film.year` — and never the year I
// watched it. The two are different questions and a chart that mixed them would
// look right and be wrong.
//
// TWO ENTRY POINTS, on purpose. The `*InView` pair takes `EnrichedWatch[]` and is
// what the main page uses, so every number moves with the filter rail. The
// `Dataset` pair takes the raw payload and needs no store or provider, which is
// what the lab's unfiltered prototypes want. Neither wraps the other: the
// difference is which watches exist at all, and that has to be decided by the
// caller rather than smuggled in behind a default.

import { starBinIndex, STAR_BINS } from "./likedChart";
import { primaryGenre, type GenreKey } from "./palette";
import { quantile } from "./statsChart";
import type { Dataset, EnrichedWatch } from "./types";

/**
 * Only "mean" is mounted on the page right now. "median" stays because the two
 * are the same chart with one line swapped, and the choice between them is a live
 * question rather than a settled one — see the note on `releaseYearBars`.
 */
export type Stat = "mean" | "median";

/**
 * Below this many films a year is drawn faded.
 *
 * A mean over one film IS that film's rating, and at full strength it says the
 * least in the loudest voice: 1922 holds a single film and would otherwise
 * outrank the seventy-odd of 2019 on a whim. It fades and never hides — a year
 * with one film is still evidence about that year, and dropping it would
 * silently redraw the axis.
 */
export const THIN_N = 5;
export const THIN_OPACITY = 0.35;

export type YearBar = {
  year: number;
  /** The statistic in STARS, 0-5, or null when the year has no rated film. */
  stars: number | null;
  /** Films behind it. */
  n: number;
};

export type YearStars = {
  year: number;
  /** Films per half-star bin, indexed into `STAR_BINS`. */
  counts: number[];
  /**
   * The genre that owns each bin, or null where none does — parallel to `counts`.
   *
   * A STRICT PLURALITY, not a tiebreak. `aggregateOrigin` settles its ties on
   * `GENRE_ORDER`, which is right for a country's single summary bar and wrong
   * here: with most bins holding one to three films, ties are the common case, and
   * a priority order would paint half the chart Horror because Horror sorts first.
   * Null falls back to the neutral mark, which reads as "mixed" — the honest
   * answer for a bin split two-and-two.
   */
  dominant: (GenreKey | null)[];
  n: number;
  /**
   * Every watch in view whose film was released this year, rated or not.
   *
   * Wider than `n` on purpose: this drives the cross-filter, and clicking 1999
   * should select the films of 1999 rather than the subset that happened to carry
   * a rating. Empty for the `Dataset` builder, which has no rail behind it.
   */
  watches: EnrichedWatch[];
};

/**
 * The half-star distribution per release year, from the watches in view.
 *
 * The main page's entry point, and it takes `EnrichedWatch[]` rather than a
 * `Dataset` because everything it draws has to move with the rail. In particular
 * "most recent rating" is resolved WITHIN the filtered set: filtered to 2019, a
 * film's standing is what I made of it that year, not an opinion I revised later
 * on a watch the filter has already removed.
 */
export function releaseYearStarsInView(
  watches: EnrichedWatch[],
  minFilms = 0,
): YearStars[] {
  const latest = new Map<number, EnrichedWatch>();
  for (const w of watches) {
    if (w.rating == null) continue;
    const cur = latest.get(w.tmdb_id);
    if (cur == null || w.date >= cur.date) latest.set(w.tmdb_id, w);
  }

  // Genre tallies per bin rather than a bare count, so a bin can be asked which
  // genre owns it. The count falls out of the tally.
  const bins = new Map<number, Map<GenreKey, number>[]>();
  for (const w of latest.values()) {
    const year = w.film?.year;
    if (year == null || w.rating == null) continue;
    const i = starBinIndex(w.rating);
    if (i < 0) continue;
    const slot = bins.get(year) ?? STAR_BINS.map(() => new Map<GenreKey, number>());
    const g = primaryGenre(w.film);
    slot[i].set(g, (slot[i].get(g) ?? 0) + 1);
    bins.set(year, slot);
  }

  const members = new Map<number, EnrichedWatch[]>();
  for (const w of watches) {
    const year = w.film?.year;
    if (year == null) continue;
    const slot = members.get(year) ?? [];
    slot.push(w);
    members.set(year, slot);
  }

  return [...bins.entries()]
    .map(([year, tallies]) => {
      const counts = tallies.map((t) => [...t.values()].reduce((a, b) => a + b, 0));
      return {
        year,
        counts,
        dominant: tallies.map(plurality),
        n: counts.reduce((a, b) => a + b, 0),
        watches: members.get(year) ?? [],
      };
    })
    .filter((r) => r.n >= minFilms)
    .sort((a, b) => a.year - b.year);
}

/** The single most common key, or null when two or more share the lead. */
function plurality(tally: Map<GenreKey, number>): GenreKey | null {
  let best: GenreKey | null = null;
  let top = 0;
  let tied = false;
  for (const [key, n] of tally) {
    if (n > top) {
      top = n;
      best = key;
      tied = false;
    } else if (n === top) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * My average film across the watches in view, in stars — the flagpole's
 * reference line.
 *
 * One row per film at its most recent rating in view, the same unit the flags
 * count, so the line and the marks it is drawn behind are built from one set of
 * numbers.
 */
export function filmMeanInView(watches: EnrichedWatch[]): number | null {
  const latest = new Map<number, EnrichedWatch>();
  for (const w of watches) {
    if (w.rating == null || w.film?.year == null) continue;
    const cur = latest.get(w.tmdb_id);
    if (cur == null || w.date >= cur.date) latest.set(w.tmdb_id, w);
  }
  const all = [...latest.values()].map((w) => w.rating!);
  if (!all.length) return null;
  return all.reduce((a, b) => a + b, 0) / all.length / 20;
}

/**
 * The most recently logged rating per film, in rating points.
 *
 * ONE ROW PER FILM, which is the only honest unit for "which year's movies are
 * best": counting watches lets a film I rewatched four times outvote four films
 * released the same year, which measures my viewing rather than the year.
 *
 * And the most recent rather than the average, because this is the project's
 * answer to a rating that CHANGED. A film rated 60 in 2019 and 80 on a rewatch in
 * 2024 has one current standing with me and it is 80; averaging reports a rating
 * I no longer hold, and taking the first reports one I have already revised.
 *
 * Ties on the same date fall to the later row, since the export is written in
 * diary order. That only bites for a film watched twice in one day.
 */
export function latestRatingByFilm(data: Dataset): Map<number, number> {
  const latest = new Map<number, { date: string; rating: number }>();
  for (const w of data.watches) {
    if (w.rating == null) continue;
    const cur = latest.get(w.tmdb_id);
    if (cur == null || w.date >= cur.date) latest.set(w.tmdb_id, { date: w.date, rating: w.rating });
  }
  return new Map([...latest].map(([id, { rating }]) => [id, rating]));
}

/** Each film's most recent rating, grouped by the year it was released. */
function ratingsByReleaseYear(data: Dataset): Map<number, number[]> {
  const ratings = latestRatingByFilm(data);
  const out = new Map<number, number[]>();
  for (const f of data.films) {
    // Films with no release year are dropped: there is no slot for "unknown" on a
    // year axis, and TMDB serves a year for every watched film here anyway.
    if (f.year == null) continue;
    const r = ratings.get(f.tmdb_id);
    if (r == null) continue;
    const slot = out.get(f.year) ?? [];
    slot.push(r);
    out.set(f.year, slot);
  }
  return out;
}

/**
 * My average film, in stars: the mean of every rated film's most recent rating.
 *
 * The reference line on the mean chart, and a different number from the median of
 * the per-year means it replaced — 3.59★ against 3.61★. They are close here and
 * they are not the same statistic: the median of year means weights 1922, which
 * holds one film, exactly as heavily as 2019, which holds seventy-four, so it
 * describes the AXIS as much as the library. This weights every film once, so a
 * year's bar clearing the line means that year beat my average film rather than
 * my average year.
 */
export function overallFilmMean(data: Dataset): number | null {
  const byYear = ratingsByReleaseYear(data);
  const all = [...byYear.values()].flat();
  if (!all.length) return null;
  return all.reduce((a, b) => a + b, 0) / all.length / 20;
}

/**
 * Every year from the first release to the last, with no gaps.
 *
 * The axis is CONTINUOUS. A categorical axis of only the years present would put
 * 1922 next to 1927 at the same spacing as 2018 next to 2019, which is a time
 * axis lying about time — and the empty stretch through the 1930s and 50s is
 * itself the shape of this library.
 */
function yearSpan(byYear: Map<number, unknown>): number[] {
  const keys = [...byYear.keys()];
  if (!keys.length) return [];
  const out: number[] = [];
  for (let y = Math.min(...keys); y <= Math.max(...keys); y++) out.push(y);
  return out;
}

/**
 * One statistic per release year, in stars.
 *
 * Stars and not rating points because that is the scale the reader rates on:
 * `my_rating` IS `star_rating * 20`, so dividing by twenty converts without
 * rounding and every axis on the site already speaks in stars.
 *
 * The two statistics genuinely disagree, which is why both are drawn. A MEAN
 * moves with every film in the year, so one masterpiece lifts it. A MEDIAN is the
 * middle film, so it ignores the masterpiece — and on a half-star lattice it also
 * quantises hard, landing most years on exactly 3.5 or 4.
 */
export function releaseYearBars(data: Dataset, stat: Stat): YearBar[] {
  const byYear = ratingsByReleaseYear(data);
  return yearSpan(byYear).map((year) => {
    const vs = byYear.get(year) ?? [];
    if (!vs.length) return { year, stars: null, n: 0 };
    const points =
      stat === "mean"
        ? vs.reduce((a, b) => a + b, 0) / vs.length
        : quantile([...vs].sort((a, b) => a - b), 0.5);
    return { year, stars: points / 20, n: vs.length };
  });
}

