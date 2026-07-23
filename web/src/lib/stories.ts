import type { ReactNode } from "react";
import type { Filters } from "./store";
import type { Film, EnrichedWatch } from "./types";
import { primaryGenre, type GenreKey } from "./palette";
import { watchKey } from "./brush";

export type ChartId =
  | "spiral"
  | "contrarian"
  | "countries"
  | "stripes"
  | "rolling"
  | "rewatch"
  | "keywords";

export type StoryFocus = {
  primary: ChartId;
  emphasize: ChartId[];
  dim: ChartId[];
};

// Display titles per chart — kept in sync with the section headings in page.tsx.
// Used to label story notes in the story panel.
export const CHART_TITLES: Record<ChartId, string> = {
  spiral: "When I watch",
  contrarian: "Me versus the critics",
  keywords: "The keywords that give me away",
  countries: "What travels well",
  stripes: "Streaks and slumps",
  rolling: "Warming up or wearing out",
  rewatch: "Second thoughts",
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
  // Per-chart prose tying the story to what each relevant chart shows. Rendered
  // in the right-hand story panel (desktop) and inline under each chart (mobile).
  notes?: Partial<Record<ChartId, string>>;
};

export type StoryConfig = {
  id: string;
  label: string;
  focus: StoryFocus;
  compute: (films: Film[], watches: EnrichedWatch[]) => StoryResult;
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
      spiral: "The tenth column lights up. Horror packs into October year after year.",
      rolling: "Horror rates just below my overall average, yet it's still what I watch most.",
    },
  };
}

function computeHiddenGems(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const filmMap = new Map(films.map((f) => [f.tmdb_id, f]));
  const byFilm = new Map<number, { ratings: number[]; watches: EnrichedWatch[] }>();
  for (const w of watches) {
    const entry = byFilm.get(w.tmdb_id) ?? { ratings: [], watches: [] };
    entry.watches.push(w);
    if (w.rating != null) entry.ratings.push(w.rating);
    byFilm.set(w.tmdb_id, entry);
  }

  const gems: Array<{ film: Film; avg: number; watches: EnrichedWatch[] }> = [];
  for (const [tmdb_id, { ratings, watches: ws }] of byFilm) {
    if (ratings.length === 0) continue;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const film = filmMap.get(tmdb_id);
    if (!film) continue;
    if (avg >= 80 && (film.imdb_votes ?? 0) < 10000) {
      gems.push({ film, avg, watches: ws });
    }
  }

  gems.sort((a, b) => b.avg - a.avg);

  if (gems.length === 0) {
    return { headline: "No hidden gems found (yet!)" };
  }

  const selection = new Set<string>();
  for (const { watches: ws } of gems) {
    for (const w of ws) {
      selection.add(watchKey(w));
    }
  }

  return {
    headline: `Hidden gem: ${gems[0].film.title}`,
    chip: "Hidden gems",
    selection,
    notes: {
      contrarian: "The highlighted films sit far right: I rate them well above the small crowd that saw them.",
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
      spiral: "The highlighted films all run 150 minutes or more. They sit high in nearly every year band.",
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
    notes: {
      stripes: "Recent stripes lean crimson: higher scores across fewer films each year.",
      spiral: "The later year-rows average higher than the early ones.",
      rolling: "My overall average drifts up as the yearly pace slows.",
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
    focus: { primary: "contrarian", emphasize: ["contrarian", "spiral"], dim: ["rewatch", "rolling"] },
    compute: computeHiddenGems,
  },
  {
    id: "genre-contrarian",
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
