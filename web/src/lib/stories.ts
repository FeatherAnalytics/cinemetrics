import type { ReactNode } from "react";
import type { Filters } from "./store";
import type { Film, EnrichedWatch } from "./types";
import { primaryGenre, type GenreKey } from "./palette";
import { watchKey } from "./brush";

export type ChartId = "spiral" | "contrarian" | "map" | "rolling" | "rewatch" | "keywords";

export type StoryFocus = {
  primary: ChartId;
  emphasize: ChartId[];
  dim: ChartId[];
};

export type StoryResult = {
  headline: string;
  subtext?: string;
  filters?: Partial<Filters>;
  selection?: Set<string>;
  extras?: ReactNode;
  rollingDimension?: string;
};

export type StoryConfig = {
  id: string;
  label: string;
  focus: StoryFocus;
  compute: (films: Film[], watches: EnrichedWatch[]) => StoryResult;
};

function computeSpooktober(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const octoberHorror = watches.filter((w) => {
    return w.d.getUTCMonth() === 9 && primaryGenre(w.film) === "Horror";
  });

  const byYear = new Map<number, number>();
  for (const w of octoberHorror) {
    const year = w.d.getUTCFullYear();
    byYear.set(year, (byYear.get(year) || 0) + 1);
  }

  let peakYear = 0;
  let peakCount = 0;
  for (const [year, count] of byYear) {
    if (count > peakCount) {
      peakYear = year;
      peakCount = count;
    }
  }

  if (peakCount === 0) {
    return { headline: "No horror films watched in October yet" };
  }
  return {
    headline: `Spooktober ${peakYear}: ${peakCount} horror films`,
    filters: { genres: new Set(["Horror"]) },
    rollingDimension: "genre",
  };
}

function computeRatingDrift(films: Film[], watches: EnrichedWatch[]): StoryResult {
  const byFilm = new Map<number, EnrichedWatch[]>();
  for (const w of watches) {
    if (w.rating != null) {
      const arr = byFilm.get(w.tmdb_id) || [];
      arr.push(w);
      byFilm.set(w.tmdb_id, arr);
    }
  }

  const drifts: Array<{ film: Film; delta: number; watches: EnrichedWatch[] }> = [];
  for (const [, ws] of byFilm) {
    if (ws.length < 2) continue;
    const sorted = ws.slice().sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].rating!;
    const last = sorted[sorted.length - 1].rating!;
    const delta = last - first;
    const film = sorted[0].film;
    if (!film) continue;
    drifts.push({ film, delta, watches: ws });
  }

  drifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top5 = drifts.slice(0, 5);

  const selection = new Set<string>();
  for (const { watches: ws } of top5) {
    for (const w of ws) {
      selection.add(watchKey(w));
    }
  }

  if (top5.length === 0) {
    return { headline: "No rating changes on rewatches yet" };
  }
  const top = top5[0];
  const sign = top.delta > 0 ? "+" : "";
  return {
    headline: `${top.film.title}: ${sign}${top.delta} points on rewatch`,
    filters: { rewatch: "rewatch" as const },
    selection,
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
    selection,
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
    headline: `I rate ${top.genre} ${absDelta} points ${direction} Metacritic`,
    filters: { genres: new Set([top.genre]) },
    rollingDimension: "genre",
  };
}

export const STORIES: StoryConfig[] = [
  {
    id: "spooktober",
    label: "Spooktober",
    focus: { primary: "spiral", emphasize: ["spiral", "rolling"], dim: ["map"] },
    compute: computeSpooktober,
  },
  {
    id: "rating-drift",
    label: "Rating Drift",
    focus: { primary: "rewatch", emphasize: ["rewatch", "contrarian"], dim: ["map"] },
    compute: computeRatingDrift,
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
];
