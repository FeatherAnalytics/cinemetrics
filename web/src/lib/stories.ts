import type { ReactNode } from "react";
import type { Filters } from "./store";
import type { Film, EnrichedWatch, WatchlistFilm } from "./types";
import { genreBars, watchlistSummary } from "./watchlistChart";
import { primaryGenre, type GenreKey } from "./palette";
import { watchKey } from "./brush";
import { ALPHA, anova, chicagoParts, hasKnownRewatchState, mean } from "./statsChart";
import {
  CROSSOVER_STARS,
  crossoverWatches,
  likedRate,
  type Rate,
} from "./likedChart";

export type ChartId =
  // Shown at the top of every set: the shape of the scale everything else uses.
  | "ratings"
  | "spiral"
  | "contrarian"
  | "countries"
  | "stripes"
  | "rolling"
  | "rewatch"
  | "keywords"
  | "franchise"
  // The stats set. These render only while the stats story is active, and when
  // they do, the eight above do not: see the `mode` field in ExplorerApp.
  | "velocity"
  | "cumulative"
  | "ytd"
  | "rewatched"
  | "monthly"
  | "weekday"
  | "genrebox"
  | "pairing"
  // The heart set. Same arrangement as the stats set: these render only while the
  // heart story is active, and the narrative eight do not.
  | "favposters"
  | "likedcurve"
  | "heartpredictors"
  | "favtie"
  | "favdirectors"
  // The watchlist set. These plot films that have never been watched, so unlike
  // the sets above they share no data with the others at all — not a different
  // question about the same watches, a different list entirely.
  | "wlgenres"
  | "wlkeywords"
  | "wlorigin"
  | "wlbarcode";

/**
 * Which group of charts a story puts on the page.
 *
 * "landing" is the page with no story running: the statistical charts, plus the
 * three narrative charts that carry a finding of their own. It is a READ rather
 * than an invitation, which is why it is a chart set and not a story with a chip.
 *
 * "narrative" is what every filter-driven story shows, and "heart" what the
 * favorites story shows. Both REPLACE the landing set, because their charts answer
 * a different question with a different vocabulary and two sets side by side read
 * as sixteen charts rather than one view.
 *
 * "watchlist" replaces the landing set for a harder reason than the other two:
 * its charts plot films with no viewing history at all, so every landing,
 * narrative and heart chart — all of which walk the watch log — would be empty
 * beside them rather than merely off-topic.
 *
 * Declared on the story rather than hardcoded at the render site, so adding a set
 * is a story field instead of another branch in ExplorerApp.
 */
export type ChartSet = "landing" | "narrative" | "heart" | "watchlist";

export type StoryFocus = {
  primary: ChartId;
  emphasize: ChartId[];
  dim: ChartId[];
};

export type StoryResult = {
  headline: string; // the finding, shown as the annotation on the primary chart
  chip?: string; // short label for the invitation chip (falls back to the story label)
  subtext?: string;
  filters?: Partial<Filters>;
  selection?: Set<string>;
  extras?: ReactNode;
  rollingDimension?: string;
  monthFocus?: number; // 0–11: the swim lane spotlights this month, dims the rest
  yearMeans?: boolean; // swim lane marks each year-row's average rating
  // Per-chart prose tying the story to what each relevant chart shows. Rendered
  // in the right-hand story panel (desktop) and inline under each chart (mobile).
  notes?: Partial<Record<ChartId, string>>;
};

export type StoryConfig = {
  id: string;
  label: string;
  focus: StoryFocus;
  /**
   * Charts this story does not show at all.
   *
   * A story that only makes sense for a handful of charts should REMOVE the rest
   * rather than dim them. Dimming says "this is here but not for you", which is a
   * worse answer than not being there: it keeps the scroll length of a page the
   * reader has no reason to read, and a dimmed chart still invites a click that
   * then fights the story's own filters.
   *
   * Prefer this over `focus.dim` for anything a story genuinely has nothing to say
   * about. `dim` is for de-emphasis WITHIN a set the reader should still see.
   */
  hide?: ChartId[];
  /**
   * Whether this is the page a reader lands on rather than a story they choose.
   *
   * The landing story gets no chip: it is not an invitation, it is the default
   * view. Its annotation still renders, which is the whole reason it stays a story
   * rather than becoming loose config, because the October finding is the best
   * single line on the page and it has to be computed from the filtered watches.
   */
  landing?: boolean;
  /**
   * The chart set this story shows. Defaults to "narrative".
   *
   * A story that names a set other than "narrative" also wants
   * `dismissOnFilter: false`, `scrollToPrimary: false` and
   * `recomputeOnFilter: true`, for the reasons documented on each: the rail stays
   * live, the whole page is the story's first chart, and the headline has to
   * follow the rail.
   */
  chartSet?: ChartSet;
  /**
   * `watchlist` is a third, OPTIONAL argument rather than a different signature
   * for the one story that needs it. Optional on both sides: every other compute
   * declares two parameters and stays assignable, and every caller with no
   * watchlist to give — the tests, and anything reading a payload written before
   * dim_watchlist existed — can still call with two.
   */
  compute: (
    films: Film[],
    watches: EnrichedWatch[],
    watchlist?: WatchlistFilm[],
  ) => StoryResult;
  /**
   * Whether filtering by hand drops out of this story. Defaults to true.
   *
   * For every narrative story the filters ARE the story: it selects a set of
   * watches and the charts highlight them, so once the reader filters to
   * something else the chip would be claiming a finding the page no longer
   * shows. Dropping out is right there.
   *
   * The stats story is the exception. It sets no filters at all; what it
   * carries is a different CHART SET. Cross-filtering within it is the intended
   * interaction, and dismissing on filter would swap all eight charts out from
   * under the click that caused it.
   */
  dismissOnFilter?: boolean;
  /**
   * Whether activating this story scrolls its primary chart into view.
   * Defaults to true.
   *
   * That scroll exists because the other stories leave the page's eight charts
   * exactly where they were: the reader needs taking to the one the story is
   * about. The stats story replaces the whole set, so its first chart IS the
   * top of the page, and scrolling anywhere would skip past charts the reader
   * has never seen.
   */
  scrollToPrimary?: boolean;
  /**
   * Recompute the annotation against the FILTERED watches on every filter
   * change, rather than computing it once from the whole dataset.
   *
   * Off for the narrative stories: they set the filters themselves, so their
   * headline describes a set they chose and there is nothing to track. The
   * stats story sets no filters and leaves the rail live, so its headline has
   * to move with the rail or it starts describing a view that is no longer on
   * screen. Note this is the ANNOTATION only; the chip strip is always computed
   * from the full dataset, so the invitations stay stable.
   */
  recomputeOnFilter?: boolean;
};

function computeSpooktober(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const octoberHorror = watches.some(
    (w) => w.d.getUTCMonth() === 9 && primaryGenre(w.film) === "Horror",
  );
  if (!octoberHorror) {
    return { headline: "No horror films watched in October yet" };
  }
  // Filters to horror watched IN OCTOBER, not merely to horror. The story is the
  // intersection, and a genre filter alone left every chart describing my horror
  // habit year-round while the copy talked about a month. Done as a `selection` of
  // watch keys because the rail has no month control: it is the one filter that
  // reaches every chart without inventing a dimension nobody can then clear.
  const octoberHorrorWatches = watches.filter(
    (w) => w.d.getUTCMonth() === 9 && primaryGenre(w.film) === "Horror",
  );

  return {
    headline: "October is spooky season",
    chip: "Spooktober",
    filters: { genres: new Set(["Horror"]) },
    selection: new Set(octoberHorrorWatches.map(watchKey)),
    rollingDimension: "genre",
    monthFocus: 9,
  };
}

/**
 * What makes a film a hidden gem. Exported so the barcode can color by the same
 * rule rather than inventing a second definition of the term the story defines.
 */
export const GEM_MIN_RATING = 80;
export const GEM_MAX_VOTES = 10_000;

function computeHiddenGems(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const filmMap = new Map(films.map((f) => [f.tmdb_id, f]));
  const byFilm = new Map<number, { latest: EnrichedWatch | null; watches: EnrichedWatch[] }>();
  for (const w of watches) {
    const entry = byFilm.get(w.tmdb_id) ?? { latest: null, watches: [] };
    entry.watches.push(w);
    // A gem is judged by where I landed on it, so the most recent rating wins
    // (a rewatch that grew on me counts; an early lukewarm score doesn't).
    if (w.rating != null && (entry.latest == null || w.d > entry.latest.d)) entry.latest = w;
    byFilm.set(w.tmdb_id, entry);
  }

  const gems: Array<{ film: Film; rating: number; watches: EnrichedWatch[] }> = [];
  for (const [tmdb_id, { latest, watches: ws }] of byFilm) {
    if (latest?.rating == null) continue;
    const film = filmMap.get(tmdb_id);
    if (!film) continue;
    if (latest.rating >= GEM_MIN_RATING && (film.imdb_votes ?? 0) < GEM_MAX_VOTES) {
      gems.push({ film, rating: latest.rating, watches: ws });
    }
  }

  gems.sort((a, b) => b.rating - a.rating);

  if (gems.length === 0) {
    return { headline: "No hidden gems found (yet!)" };
  }

  const selection = new Set<string>();
  for (const { watches: ws } of gems) {
    for (const w of ws) {
      selection.add(watchKey(w));
    }
  }

  // The residual chart only plots films with all three critic scores, and by
  // definition gems are films critics barely covered — say so instead of
  // letting the counts silently disagree.
  const withCritics = gems.filter(
    ({ film }) =>
      film.metascore != null && film.rt_rating != null && film.imdb_rating != null,
  ).length;
  const coverageNote =
    withCritics < gems.length
      ? ` Only ${withCritics} of the ${gems.length} gems have full critic scores (obscurity and critic coverage don't mix), so the rest can't be placed here.`
      : "";

  return {
    headline: `Hidden gem: ${gems[0].film.title}`,
    chip: "Hidden gems",
    // Matches the rule at the top of this function exactly: 80 or above, under ten
    // thousand IMDB votes. A definition that rounds off the threshold is a
    // definition the chart can be caught contradicting.
    subtext: `A hidden gem is a film I rated ${GEM_MIN_RATING} or above that fewer than ${GEM_MAX_VOTES.toLocaleString()} people have rated on IMDB.`,
    selection,
    notes: {
      contrarian: `The highlighted films sit far right: I rate them well above the small crowd that saw them.${coverageNote}`,
      spiral: "Highlighted dots are films almost no one else logged.",
    },
  };
}

/**
 * The keyword whose heart rate sits furthest from my overall one, among a set.
 *
 * Mirrors what `KeywordBars` draws, including its evidence floor, so a note about
 * that chart cannot describe a row the chart declined to plot. Measured rather than
 * asserted because the story's own filter decides which films are in scope, and a
 * hardcoded keyword would be a claim the rail could falsify.
 */
const KEYWORD_MIN_FILMS = 10;

function topKeywordHeartGap(
  watches: EnrichedWatch[],
): { keyword: string; pp: number } | null {
  const hearts = new Map<number, boolean>();
  for (const w of watches) if (w.heart != null) hearts.set(w.tmdb_id, w.heart);
  if (hearts.size === 0) return null;

  const films = new Map<number, Film>();
  for (const w of watches) if (w.film) films.set(w.tmdb_id, w.film);

  let baseLiked = 0;
  for (const v of hearts.values()) if (v) baseLiked += 1;
  const base = baseLiked / hearts.size;

  const byKeyword = new Map<string, { liked: number; n: number }>();
  for (const [id, heart] of hearts) {
    for (const kw of films.get(id)?.keywords ?? []) {
      const e = byKeyword.get(kw) ?? { liked: 0, n: 0 };
      e.n += 1;
      if (heart) e.liked += 1;
      byKeyword.set(kw, e);
    }
  }

  let best: { keyword: string; pp: number } | null = null;
  for (const [keyword, e] of byKeyword) {
    if (e.n < KEYWORD_MIN_FILMS) continue;
    const pp = (e.liked / e.n - base) * 100;
    if (best == null || Math.abs(pp) > Math.abs(best.pp)) best = { keyword, pp };
  }
  return best;
}

/** Exported for the same reason as the gem thresholds. */
export const LONG_MIN = 150; // minutes
const SHORT_MAX = 90;

function computeRuntime(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const longWatches: EnrichedWatch[] = [];
  let longSum = 0;
  let longN = 0;
  let shortSum = 0;
  let shortN = 0;
  for (const w of watches) {
    if (w.rating == null || !w.film || w.film.runtime == null) continue;
    if (w.film.runtime >= LONG_MIN) {
      longSum += w.rating;
      longN += 1;
      longWatches.push(w);
    } else if (w.film.runtime < SHORT_MAX) {
      shortSum += w.rating;
      shortN += 1;
    }
  }
  if (longN === 0 || shortN === 0) {
    return { headline: "Not enough films to compare runtimes" };
  }
  const delta = Math.round(longSum / longN - shortSum / shortN);
  // Scoped to the LONG films, because that is what the keyword chart is drawing
  // once this story's filter lands. Measured over every watch instead, the note
  // reported a keyword from the whole library and then described it as a fact about
  // long films.
  const topKeyword = topKeywordHeartGap(
    watches.filter((w) => (w.film?.runtime ?? 0) >= LONG_MIN),
  );

  return {
    headline: `I rate ${LONG_MIN}-min+ films ${delta} points above sub-90s`,
    chip: "The longer, the better",
    selection: new Set(longWatches.map(watchKey)),
    notes: {
      spiral: `The highlighted films all run ${LONG_MIN} minutes or more. They sit high in every single year band.`,
      contrarian: "Critics barely reward length. I do: the long films skew right of the model here.",
      ...(topKeyword
        ? {
            // Names the keyword and the direction, never the number. The bar prints
            // the number, and the two disagreed by a point: this helper counts every
            // long film while the chart's film set comes from the critics model, which
            // drops films with no critic scores.
            keywords: `One keyword clears the evidence floor among these long films: ${topKeyword.keyword} draws the heart ${topKeyword.pp < 0 ? "less" : "more"} often than my library average. Length is not the only thing moving here.`,
          }
        : {}),
    },
  };
}

function computePickier(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const byYear = new Map<number, { n: number; sum: number; rated: number }>();
  for (const w of watches) {
    const y = w.d.getUTCFullYear();
    const e = byYear.get(y) ?? { n: 0, sum: 0, rated: 0 };
    e.n += 1;
    if (w.rating != null) {
      e.sum += w.rating;
      e.rated += 1;
    }
    byYear.set(y, e);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length < 2) {
    return { headline: "Not enough years to see a trend" };
  }
  const first = byYear.get(years[0])!;
  const last = byYear.get(years[years.length - 1])!;
  const firstAvg = first.rated ? first.sum / first.rated : 0;
  const lastAvg = last.rated ? last.sum / last.rated : 0;
  const headline =
    last.n < first.n && lastAvg > firstAvg
      ? "I watch less now, but rate higher"
      : `From ${years[0]} to ${years[years.length - 1]}, my pace and taste shifted`;
  return {
    headline,
    chip: "Getting pickier",
    yearMeans: true,
    notes: {
      stripes: "Recent stripes lean crimson: higher scores across fewer films each year.",
      spiral: `The dashed line across each row is that year's average rating: ${Math.round(firstAvg)} in ${years[0]}, ${Math.round(lastAvg)} in ${years[years.length - 1]}.`,
      rolling: "My overall average drifts up as the yearly pace slows.",
    },
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function computeBinges(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const byDay = new Map<string, EnrichedWatch[]>();
  for (const w of watches) {
    const list = byDay.get(w.date) ?? [];
    list.push(w);
    byDay.set(w.date, list);
  }
  const bingeDays = [...byDay.entries()].filter(([, ws]) => ws.length >= 2);
  if (bingeDays.length === 0) {
    return { headline: "No double-feature days yet" };
  }
  let peak = bingeDays[0];
  for (const d of bingeDays) if (d[1].length > peak[1].length) peak = d;

  const selection = new Set<string>();
  for (const [, ws] of bingeDays) for (const w of ws) selection.add(watchKey(w));

  return {
    headline: `${bingeDays.length} double-feature days, peaking at ${peak[1].length} films on ${prettyDate(peak[0])}`,
    chip: "Double features",
    selection,
    notes: {
      spiral: "Every highlighted dot shares its date with at least one other film. Stacked pairs and towers are single sittings.",
      stripes: "Binge days land as back-to-back stripes with no gap: the barcode's densest clusters.",
    },
  };
}

function computeCollections(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const byCollection = new Map<string, { watches: EnrichedWatch[]; filmIds: Set<number> }>();
  for (const w of watches) {
    const c = w.film?.collection;
    if (!c) continue;
    const e = byCollection.get(c) ?? { watches: [], filmIds: new Set() };
    e.watches.push(w);
    e.filmIds.add(w.tmdb_id);
    byCollection.set(c, e);
  }
  // A franchise "counts" once I've watched at least two entries of it.
  const franchises = [...byCollection.entries()].filter(([, e]) => e.filmIds.size >= 2);
  if (franchises.length === 0) {
    return { headline: "No franchise runs yet" };
  }
  franchises.sort((a, b) => b[1].watches.length - a[1].watches.length);
  const [topName, topEntry] = franchises[0];

  // Densest run: the most watches of one collection inside any 7-day window.
  let run = { name: "", count: 0, start: "", end: "" };
  for (const [name, e] of franchises) {
    const ds = e.watches.map((w) => w.d.getTime()).sort((a, b) => a - b);
    for (let i = 0; i < ds.length; i++) {
      let j = i;
      while (j + 1 < ds.length && ds[j + 1] - ds[i] <= 7 * 86400_000) j++;
      if (j - i + 1 > run.count) {
        run = {
          name,
          count: j - i + 1,
          start: new Date(ds[i]).toISOString().slice(0, 10),
          end: new Date(ds[j]).toISOString().slice(0, 10),
        };
      }
    }
  }

  const selection = new Set<string>();
  for (const [, e] of franchises) for (const w of e.watches) selection.add(watchKey(w));

  const shortName = topName.replace(/ Collection$/, "");
  // The headline already names the leading franchise, so the chart note only
  // carries what the headline doesn't: the densest week-long run.
  const runNote =
    run.count >= 3
      ? `The densest run is ${run.count} ${run.name.replace(/ Collection$/, "")} films in the week of ${prettyDate(run.start)}.`
      : "";

  // Share of returned-to films that belong to any collection, for the rewatch note.
  const watchCounts = new Map<number, number>();
  for (const w of watches) watchCounts.set(w.tmdb_id, (watchCounts.get(w.tmdb_id) ?? 0) + 1);
  const filmById = new Map(films.map((f) => [f.tmdb_id, f]));
  const rewatched = [...watchCounts.entries()].filter(([, n]) => n >= 2);
  const rewatchedInCollection = rewatched.filter(
    ([id]) => filmById.get(id)?.collection != null,
  ).length;
  const rewatchPct = rewatched.length
    ? Math.round((100 * rewatchedInCollection) / rewatched.length)
    : 0;

  return {
    headline: `${shortName}: ${topEntry.watches.length} watches across ${topEntry.filmIds.size} films`,
    chip: "Franchise runs",
    selection,
    notes: {
      ...(runNote ? { franchise: runNote } : {}),
      spiral: "Highlighted dots are franchise entries, meaning collections where I've watched two or more films.",
      rewatch: `${rewatchPct}% of the films I've returned to belong to a franchise.`,
    },
  };
}

/**
 * The stats story: eight statistical charts in place of the eight narrative
 * ones, rather than alongside them.
 *
 * The finding it is built around is a NULL result, deliberately. Month, weekday
 * and genre all fail to predict my rating, while the amount I watch swings by a
 * factor of three. Stated once, up front, that reads as a finding; left as three
 * separate captions each saying a test failed, it read as three failures.
 *
 * The ANOVAs still run, but nothing prints an F or a p any more. They GATE the
 * claim instead: the "nothing moves my rating" line is only shown when all three
 * tests actually come back null, so the sentence cannot outlive the data that
 * justified it.
 *
 * The headline pairs the two halves directly, and both numbers are measured
 * here rather than written down, so it cannot drift from the charts under it.
 */
/**
 * The heart and the four favorites, as one story.
 *
 * They belong together because they are the same question at two resolutions.
 * `liked` is the only column that measures affection rather than judgment, and it
 * turns out to agree with the rating everywhere except one narrow band. The four
 * favorites are the extreme case of that same gap: they are the films affection
 * singles out, and NOTHING in the data reproduces the list.
 *
 * Every figure is measured off the watches passed in, never quoted, because this
 * story leaves the rail live and recomputes on every filter change. A hardcoded
 * "46%" would be a sentence about films the reader has just filtered away.
 */
function computeHeart(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const overall = likedRate(watches);
  if (overall.n === 0) {
    return {
      headline: "No watch in view recorded the Letterboxd heart",
      chip: "The heart",
    };
  }

  const band = likedRate(crossoverWatches(watches));
  const pct = (r: Rate) => Math.round(r.rate * 100);

  const headline =
    band.n > 0
      ? `Above ${CROSSOVER_STARS[1]}★ the heart is close to automatic and below ` +
        `${CROSSOVER_STARS[0]}★ it is almost never given; across the ${band.n} watches ` +
        `in between it is ${pct(band)}%`
      : `${pct(overall)}% of the ${overall.n} watches in view got the heart`;

  return {
    headline,
    chip: "Favs and likes",
    notes: {
      // One note per chart at most, and only where the chart cannot say it. The
      // curve, the tie and the cohorts all restated percentages the bars already
      // print, which put one finding on screen three times over.
      favposters:
        "Curated by hand. No ordering the data can produce puts these four together.",
      heartpredictors:
        "Nothing here separates from my overall rate by much, which is the result rather than a missing one.",
    },
  };
}

function computeStats(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const counts = Array(12).fill(0) as number[];
  const sums = Array(12).fill(0) as number[];
  const rated = Array(12).fill(0) as number[];
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  const byDow: number[][] = Array.from({ length: 7 }, () => []);
  for (const w of watches) {
    const { month, dow } = chicagoParts(w.date);
    counts[month] += 1;
    if (w.rating != null) {
      sums[month] += w.rating;
      rated[month] += 1;
      byMonth[month].push(w.rating);
      byDow[dow].push(w.rating);
    }
  }
  const seen = counts.map((n, m) => ({ m, n })).filter((e) => e.n > 0);
  if (seen.length < 2) {
    return { headline: "Not enough months logged to compare", chip: "Deep dive" };
  }
  const busiest = seen.reduce((a, b) => (b.n > a.n ? b : a));
  const quietest = seen.reduce((a, b) => (b.n < a.n ? b : a));
  const avg = (m: number) => (rated[m] ? sums[m] / rated[m] : null);
  const hi = avg(busiest.m);
  const lo = avg(quietest.m);
  const ratio = busiest.n / quietest.n;
  const gap = hi != null && lo != null ? Math.abs(hi - lo) : null;

  // One rating per FILM per genre, so a rewatched film cannot vote twice.
  const ratingsByFilm = new Map<number, { g: GenreKey; rs: number[] }>();
  for (const w of watches) {
    if (w.rating == null) continue;
    const e = ratingsByFilm.get(w.tmdb_id) ?? { g: primaryGenre(w.film), rs: [] };
    e.rs.push(w.rating);
    ratingsByFilm.set(w.tmdb_id, e);
  }
  const perGenre = new Map<GenreKey, number[]>();
  for (const { g, rs } of ratingsByFilm.values()) {
    perGenre.set(g, [...(perGenre.get(g) ?? []), mean(rs)]);
  }

  // The two heaviest years, for the velocity note. Measured, so it follows the
  // filter instead of asserting 2020 and 2021 about a set that may not contain
  // them.
  const perYear = new Map<number, number>();
  for (const w of watches) {
    const y = Number(w.date.slice(0, 4));
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  const peakYears = [...perYear.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 2)
    .map(([y]) => y)
    .sort((a, b) => a - b);

  /**
   * Do I rate a film higher on the way back than the first time through?
   *
   * D5: `rewatch` is three-state. The 129 sheet-era rows record `false` because
   * the Google Sheet had no such field, not because they were first viewings,
   * so they are excluded from BOTH sides rather than silently counted as first
   * watches, which would drag the first-watch mean toward the sheet era.
   */
  const firstRatings: number[] = [];
  const rewatchRatings: number[] = [];
  for (const w of watches) {
    if (w.rating == null || !hasKnownRewatchState(w)) continue;
    (w.rewatch ? rewatchRatings : firstRatings).push(w.rating);
  }
  const rewatchNote =
    firstRatings.length >= 10 && rewatchRatings.length >= 10
      ? `I rate rewatches ${(mean(rewatchRatings) / 20).toFixed(1)}★ and first watches ${(mean(firstRatings) / 20).toFixed(1)}★.`
      : null;

  // A missing test counts as null: too few groups to find an effect is not
  // evidence of one.
  const isNull = (a: ReturnType<typeof anova>) => a == null || a.p >= ALPHA;
  const nothingPredicts =
    isNull(anova(byMonth)) && isNull(anova(byDow)) && isNull(anova([...perGenre.values()]));

  // The rating gap between those two months is deliberately NOT in the
  // headline. It is a non-finding by construction (the whole story is that the
  // rating does not move), so it belongs on the pace chart's hover, where a
  // reader who wonders can check it, rather than in the one line everybody
  // reads. `gap` still gates the phrasing below.
  const headline =
    gap == null
      ? `${MONTHS[busiest.m]} outdraws ${MONTHS[quietest.m]} ${busiest.n} to ${quietest.n}`
      : `I watch ${ratio.toFixed(1)}x more in ${MONTHS[busiest.m]} than ${MONTHS[quietest.m]}`;

  return {
    headline,
    chip: "Dive deep",
    ...(nothingPredicts
      ? { subtext: "What changes is how much I watch, not what I think of it." }
      : {}),
    // Two notes, both MEASURED from the filtered set rather than written down,
    // so they describe whatever the reader is looking at. A note earns its
    // place only by saying something neither the chart nor its blurb already
    // says, and that a reader could not get by looking.
    notes: {
      ...(peakYears.length === 2
        ? {
            velocity: `The peak years are ${peakYears[0]} and ${peakYears[1]}. Nothing since has come close.`,
          }
        : {}),
      ...(rewatchNote ? { rewatched: rewatchNote } : {}),
    },
  };
}

/**
 * The watchlist story: five breakdowns of films that have not been watched.
 *
 * Every other story reads the diary. This one reads the OTHER list, so it takes
 * neither `films` nor `watches` — a watchlist film has no rating, no date and no
 * heart, and the charts in every other set have nothing to draw for it.
 *
 * The headline counts what is genuinely waiting rather than the list length.
 * Letterboxd leaves a film on the watchlist after it is logged and the reader
 * clears them only sometimes, so a handful have already been seen; calling all
 * 136 "waiting" would be wrong by exactly that many. The gap goes in the subtext
 * rather than being hidden, because a reader who counts the bars will find it.
 */
function computeWatchlist(
  _films: Film[],
  _watches: EnrichedWatch[],
  watchlist: WatchlistFilm[] = [],
): StoryResult {
  if (watchlist.length === 0) {
    return { headline: "No watchlist data", chip: "Watchlist" };
  }

  const { total, watched, preMillenniumShare } = watchlistSummary(watchlist);
  const topGenre = genreBars(watchlist, 1)[0];
  const pct = Math.round(100 * preMillenniumShare);

  // Both numbers are measured here rather than written down, so the line cannot
  // drift from the charts underneath it.
  const headline = `${total} films on the list, ${pct}% of them from before 2000`;

  return {
    headline,
    chip: "Watchlist",
    ...(watched > 0
      ? {
          subtext: ``,
        }
      : {}),
    notes: {
      // A SHARE, not the raw count: the bar already carries the count, so
      // repeating it says the same number twice, while the share against the
      // list is the part the chart cannot show — genres overlap, so the bars
      // do not sum to anything a reader could divide by.
      ...(topGenre
        ? {
            wlgenres: `${topGenre.label} makes up ${Math.round(
              (100 * topGenre.count) / watchlist.length,
            )}% of the watchlist.`,
          }
        : {}),
      wlorigin:
        "",
      // The blurb explains the encoding, so the note carries what the shape
      // itself says rather than restating how to read it.
      wlbarcode:
        "The columns thicken toward the present, but the tallest single year still holds only a handful — this is a wide list, not a deep one.",
    },
  };
}

export const STORIES: StoryConfig[] = [
  // Chip order is this array's order, most inviting first. `stats` is the landing
  // story and is filtered out of the strip, so it sits last.
  {
    id: "heart",
    label: "Favs and likes",
    // `dim` is empty, but for a different reason than on the stats story. This one
    // does NOT replace the narrative charts: it adds five of its own and recolors
    // the eight through the heart lens. A dimmed chart would be one the story
    // reached into and then told the reader to ignore.
    focus: {
      primary: "likedcurve",
      emphasize: ["likedcurve", "heartpredictors", "favtie"],
      dim: [],
    },
    chartSet: "heart",
    compute: computeHeart,
    dismissOnFilter: false,
    scrollToPrimary: false,
    recomputeOnFilter: true,
  },
  {
    id: "spooktober",
    label: "Spooktober",
    focus: { primary: "spiral", emphasize: ["spiral", "rolling"], dim: [] },
    compute: computeSpooktober,
  },
  {
    id: "hidden-gems",
    label: "Hidden Gems",
    // Primary is the chart at the top of every set, so the definition of a hidden
    // gem lands before the reader meets a chart that assumes it. The critics chart
    // was primary before, which put the annotation two screens down and left the
    // term undefined until then.
    focus: { primary: "ratings", emphasize: ["contrarian", "spiral"], dim: [] },
    hide: ["pairing", "franchise"],
    compute: computeHiddenGems,
  },
  {
    id: "runtime",
    label: "The longer, the better",
    focus: { primary: "spiral", emphasize: ["spiral", "contrarian"], dim: [] },
    hide: ["pairing"],
    compute: computeRuntime,
  },
  {
    id: "getting-pickier",
    label: "Getting pickier",
    focus: { primary: "spiral", emphasize: ["spiral", "stripes", "rolling"], dim: [] },
    compute: computePickier,
  },
  {
    id: "binges",
    label: "Double features",
    focus: { primary: "spiral", emphasize: ["spiral", "stripes"], dim: [] },
    // A double feature is a fact about DAYS. Nothing about rewatching, critics,
    // genre pairs, keywords, countries or a rolling average speaks to it.
    hide: ["rewatch", "contrarian", "pairing", "keywords", "countries", "rolling"],
    compute: computeBinges,
  },
  {
    id: "franchises",
    label: "Franchise runs",
    focus: { primary: "franchise", emphasize: ["franchise", "spiral", "rewatch"], dim: [] },
    hide: ["pairing"],
    compute: computeCollections,
  },
  {
    id: "stats",
    label: "The shape of it",
    landing: true,
    // `dim` is empty by design. The narrative charts are ABSENT while this story
    // runs, not faded, so there is nothing left on screen to dim.
    focus: { primary: "monthly", emphasize: ["monthly", "velocity", "genrebox"], dim: [] },
    chartSet: "landing",
    compute: computeStats,
    dismissOnFilter: false,
    scrollToPrimary: false,
    recomputeOnFilter: true,
  },
  {
    id: "watchlist",
    label: "Watchlist",
    // `dim` is empty for the same reason the landing story's is: the other
    // charts are ABSENT here, not faded.
    focus: { primary: "wlbarcode", emphasize: ["wlbarcode", "wlgenres"], dim: [] },
    chartSet: "watchlist",
    compute: computeWatchlist,
    // The three flags a non-narrative chart set wants, for the reasons on each:
    // the rail stays live, the whole page is this story's first chart, and the
    // headline has to follow the rail or it keeps claiming all 136 films over
    // charts showing the 19 that survived a filter.
    dismissOnFilter: false,
    scrollToPrimary: false,
    recomputeOnFilter: true,
  },
];

/**
 * The chart set an active story asks for, or "narrative" when none is active.
 *
 * The single place that answers the question, so a new set never needs a second
 * branch at a render site to be added.
 */
export function chartSetFor(activeStory: string | null): ChartSet {
  if (!activeStory) return LANDING_STORY?.chartSet ?? "landing";
  return STORIES.find((s) => s.id === activeStory)?.chartSet ?? "narrative";
}

/**
 * The story that renders with nothing selected. There is exactly one.
 *
 * Held as a lookup rather than an id constant so removing the `landing` flag is
 * enough to turn it back into an ordinary story.
 */
export const LANDING_STORY: StoryConfig | undefined = STORIES.find((s) => s.landing);

/** The charts an active story suppresses entirely. */
export function hiddenCharts(activeStory: string | null): ChartId[] {
  if (!activeStory) return [];
  return STORIES.find((s) => s.id === activeStory)?.hide ?? [];
}

/**
 * Whether an ACTIVE story replaces the page's charts rather than highlighting them.
 *
 * False with no story, and that is the point: the landing set is not something a
 * story swapped in. Its two callers both want "did a story just change the page
 * under the reader" - one collapses the rail, the other scrolls to the top - and on
 * first load neither should fire. Scrolling there would also fight the `#chart-`
 * deep links the copy-link buttons hand out.
 */
export function swapsChartSet(activeStory: string | null): boolean {
  if (!activeStory) return false;
  return chartSetFor(activeStory) !== "narrative";
}

// All story headlines computed once from the full dataset, for the chip strip.
export function computeStoryHeadlines(
  films: Film[],
  watches: EnrichedWatch[],
  watchlist: WatchlistFilm[] = [],
): { id: string; label: string; headline: string; chip: string }[] {
  return STORIES.filter((s) => !s.landing).map((s) => {
    const r = s.compute(films, watches, watchlist);
    return { id: s.id, label: s.label, headline: r.headline, chip: r.chip ?? s.label };
  });
}
