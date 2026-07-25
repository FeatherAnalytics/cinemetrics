import type { ReactNode } from "react";
import type { Filters } from "./store";
import type { Film, EnrichedWatch } from "./types";
import { primaryGenre, type GenreKey } from "./palette";
import { watchKey } from "./brush";
import { ALPHA, anova, chicagoParts, mean } from "./statsChart";

export type ChartId =
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
  | "pairing";

export type StoryFocus = {
  primary: ChartId;
  emphasize: ChartId[];
  dim: ChartId[];
};

// Display titles per chart — kept in sync with CHART_SECTIONS in ExplorerApp.tsx.
// Used to label story notes in the story panel.
export const CHART_TITLES: Record<ChartId, string> = {
  spiral: "When I watch",
  contrarian: "Me versus the critics",
  keywords: "The keywords that give me away",
  countries: "What travels well",
  stripes: "Streaks and slumps",
  rolling: "Warming up or wearing out",
  rewatch: "Second thoughts",
  franchise: "Franchise runs",
  velocity: "Viewing velocity",
  cumulative: "Cumulative watches",
  ytd: "Viewings to date",
  rewatched: "What I go back to",
  monthly: "Pace by month",
  weekday: "Pace by weekday",
  genrebox: "Ratings by primary genre",
  pairing: "Genre pairing",
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
  compute: (films: Film[], watches: EnrichedWatch[]) => StoryResult;
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
};

function computeSpooktober(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const octoberHorror = watches.some(
    (w) => w.d.getUTCMonth() === 9 && primaryGenre(w.film) === "Horror",
  );
  if (!octoberHorror) {
    return { headline: "No horror films watched in October yet" };
  }
  return {
    headline: "October is spooky season",
    chip: "Spooktober",
    filters: { genres: new Set(["Horror"]) },
    rollingDimension: "genre",
    monthFocus: 9,
    notes: {
      spiral:
        "The tenth column lights up. Horror packs into October year after year. And the lone crimson sun in June 2024? Midsommar, watched on the summer solstice.",
      rolling: "Horror rates just below my overall average, yet it's still what I watch most.",
      keywords:
        "Remake floats to the top. But I avoid remakes unless word of mouth clears them, so the few I watch are pre-screened. Self-selection bias, in one bar.",
      stripes:
        "The coldest run in the whole barcode is October 2020: a film a day for Spooktober, and the daily grind shows in the scores.",
    },
  };
}

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
    if (latest.rating >= 80 && (film.imdb_votes ?? 0) < 10000) {
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
    selection,
    notes: {
      contrarian: `The highlighted films sit far right: I rate them well above the small crowd that saw them.${coverageNote}`,
      spiral: "Highlighted dots are films almost no one else logged.",
    },
  };
}

function computeGenreContrarian(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const byGenre = new Map<GenreKey, { myRatings: number[]; metascores: number[] }>();

  for (const w of watches) {
    if (!w.film) continue;
    if (w.rating != null && w.film.metascore != null) {
      const genre = primaryGenre(w.film);
      const data = byGenre.get(genre) || { myRatings: [], metascores: [] };
      data.myRatings.push(w.rating);
      data.metascores.push(w.film.metascore);
      byGenre.set(genre, data);
    }
  }

  const deltas: Array<{ genre: GenreKey; delta: number }> = [];
  for (const [genre, data] of byGenre) {
    if (data.myRatings.length < 2) continue;
    const avgMy = data.myRatings.reduce((a, b) => a + b, 0) / data.myRatings.length;
    const avgMeta = data.metascores.reduce((a, b) => a + b, 0) / data.metascores.length;
    const delta = avgMy - avgMeta;
    deltas.push({ genre, delta });
  }

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (deltas.length === 0) {
    return { headline: "Not enough data to find genre contrarian patterns" };
  }
  const top = deltas[0];
  const direction = top.delta > 0 ? "above" : "below";
  const absDelta = Math.abs(top.delta).toFixed(0);

  return {
    headline: `I rate ${top.genre} ${absDelta} points ${direction} the critics`,
    chip: top.genre === "Comedy" ? "Laugh to live" : top.genre,
    filters: { genres: new Set([top.genre]) },
    rollingDimension: "genre",
    notes: {
      contrarian: `${top.genre} sits furthest from the critics' line, ${absDelta} points ${direction} it.`,
      rolling: `Watch ${top.genre}'s line ride ${direction} my overall baseline.`,
    },
  };
}

const LONG_MIN = 150; // minutes
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
  return {
    headline: `I rate ${LONG_MIN}-min+ films ${delta} points above sub-90s`,
    chip: "The longer, the better",
    selection: new Set(longWatches.map(watchKey)),
    notes: {
      spiral: "The highlighted films all run 150 minutes or more. They sit high in every single year band.",
      contrarian: "Critics barely reward length. I do: the long films skew right of the model here.",
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
    return { headline: "Not enough months logged to compare", chip: "Dive deep" };
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
    // One note. A note earns its place only by saying something neither the
    // chart nor its blurb already says, and that a reader could not get by
    // looking. The rest were restating an axis, repeating the headline,
    // duplicating a blurb, or announcing that the chart is interactive, which
    // every chart on this site already is.
    notes: {
      velocity: "The twin peaks are 2020 and 2021. Nothing since has come close.",
    },
  };
}

export const STORIES: StoryConfig[] = [
  {
    id: "spooktober",
    label: "Spooktober",
    focus: { primary: "spiral", emphasize: ["spiral", "rolling"], dim: ["countries"] },
    compute: computeSpooktober,
  },
  {
    id: "hidden-gems",
    label: "Hidden Gems",
    // keywords is dimmed because gems are too few (and too critic-sparse) to
    // ever clear the keyword chart's 10-film threshold.
    focus: { primary: "contrarian", emphasize: ["contrarian", "spiral"], dim: ["rewatch", "rolling", "keywords"] },
    compute: computeHiddenGems,
  },
  {
    id: "critics-and-me",
    label: "Genre Contrarian",
    focus: { primary: "contrarian", emphasize: ["contrarian", "rolling"], dim: ["rewatch"] },
    compute: computeGenreContrarian,
  },
  {
    id: "runtime",
    label: "The longer, the better",
    focus: { primary: "spiral", emphasize: ["spiral", "contrarian"], dim: ["countries", "keywords"] },
    compute: computeRuntime,
  },
  {
    id: "getting-pickier",
    label: "Getting pickier",
    focus: { primary: "stripes", emphasize: ["stripes", "spiral", "rolling"], dim: ["countries", "keywords"] },
    compute: computePickier,
  },
  {
    id: "binges",
    label: "Double features",
    focus: { primary: "spiral", emphasize: ["spiral", "stripes"], dim: ["countries", "keywords", "rolling"] },
    compute: computeBinges,
  },
  {
    id: "franchises",
    label: "Franchise runs",
    focus: { primary: "franchise", emphasize: ["franchise", "spiral", "rewatch"], dim: ["countries", "keywords"] },
    compute: computeCollections,
  },
  {
    id: "stats",
    label: "The stats",
    // `dim` is empty by design. The narrative charts are ABSENT while this story
    // runs, not faded, so there is nothing left on screen to dim.
    focus: { primary: "monthly", emphasize: ["monthly", "velocity", "genrebox"], dim: [] },
    compute: computeStats,
    dismissOnFilter: false,
    scrollToPrimary: false,
  },
];

// All story headlines computed once from the full dataset, for the chip strip.
export function computeStoryHeadlines(
  films: Film[],
  watches: EnrichedWatch[],
): { id: string; label: string; headline: string; chip: string }[] {
  return STORIES.map((s) => {
    const r = s.compute(films, watches);
    return { id: s.id, label: s.label, headline: r.headline, chip: r.chip ?? s.label };
  });
}
