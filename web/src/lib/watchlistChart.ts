// Pure helpers behind the watchlist charts. Kept out of the components for the
// same reason as statsChart.ts: a miscount here would not break the render, it
// would just put a wrong number on the page.

import { countryName } from "./countries";
import { languageName } from "./languages";
import { GENRE_COLORS, GENRE_KEYS, GENRE_ORDER, primaryGenre, type GenreKey } from "./palette";
import type { WatchlistFilm } from "./types";

export type RankedBar = {
  key: string; // the filter value (ISO code, genre name, keyword)
  label: string; // what the reader sees
  count: number;
  color: string;
  genre: GenreKey; // dominant primary genre among the films behind the bar
};

// Anything outside the five tracked genres shares one neutral. The genre palette
// is an identity scale with five slots; stretching it to the ~19 TMDB genres
// would mean inventing colours that carry no meaning anywhere else. Reached via
// GENRE_COLORS.Other, which is what dominantGenre returns for such a group.

function isTracked(name: string): name is GenreKey {
  return (GENRE_KEYS as string[]).includes(name);
}

/**
 * The genre a group of films is mostly made of, by the site's five-slot rule.
 *
 * Lets a bar for Japan or for `neo-noir` carry a colour that means something —
 * what I am actually queueing from there — instead of one flat neutral for every
 * row. Ties break by GENRE_ORDER priority, the same rule aggregateCountries
 * uses, so the two charts cannot disagree about one country's colour.
 */
function dominantGenre(films: WatchlistFilm[]): GenreKey {
  const tally = new Map<GenreKey, number>();
  for (const f of films) {
    const g = primaryGenre(f);
    tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  let best: GenreKey = "Other";
  let n = -1;
  for (const g of [...GENRE_ORDER, "Other"] as GenreKey[]) {
    const c = tally.get(g) ?? 0;
    if (c > n) [n, best] = [c, g];
  }
  return best;
}

/**
 * Rank a multi-valued field by how many films carry each value.
 *
 * A film contributes to EVERY value it carries, so the bars sum past the film
 * count. That is the honest reading of "how many watchlist films are tagged
 * Drama" and the charts say so in their takeaway; picking one value per film
 * instead would mean choosing between a film's genres on the strength of TMDB's
 * array order, which is not ranked by anything.
 *
 * Ties break alphabetically so the order is stable as the filter moves — with
 * 136 films across ~19 genres, ties are common, and bars that reshuffle on an
 * unrelated filter change read as data changing when it did not.
 */
export function rankMulti(
  films: WatchlistFilm[],
  pick: (f: WatchlistFilm) => string[],
  opts: {
    limit?: number;
    minCount?: number;
    label?: (key: string) => string;
    /**
     * How a bar earns its colour.
     *
     * "dominant" reads the films behind the bar and takes their commonest
     * primary genre — right for a country, a language or a keyword, where the
     * key is not itself a genre and the colour is the only place that
     * information can go.
     *
     * "self" is for the genre chart, where the key IS the category. Colouring
     * Mystery by its films' dominant primary genre painted it Horror, because
     * primaryGenre resolves Horror first and most Mystery films on the list are
     * also horror — so the chart showed a red bar labelled Mystery directly
     * above a red bar labelled Horror, which reads as a mistake whatever the
     * logic behind it. Untracked genres take the neutral instead.
     */
    colorBy?: "dominant" | "self";
  } = {},
): RankedBar[] {
  const { limit = 10, minCount = 1, label = (k) => k, colorBy = "dominant" } = opts;
  const members = new Map<string, WatchlistFilm[]>();
  for (const f of films) {
    // A value listed twice on one film still counts once: the question is how
    // many FILMS carry it.
    for (const v of new Set(pick(f))) {
      const key = v.trim();
      if (!key) continue;
      const list = members.get(key);
      if (list) list.push(f);
      else members.set(key, [f]);
    }
  }
  return [...members.entries()]
    .filter(([, fs]) => fs.length >= minCount)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, fs]) => {
      // A tracked genre always keeps its own colour. Beyond that, see colorBy.
      const genre = isTracked(key)
        ? key
        : colorBy === "self"
          ? "Other"
          : dominantGenre(fs);
      return {
        key,
        label: label(key),
        count: fs.length,
        genre,
        color: GENRE_COLORS[genre],
      };
    });
}

export function genreBars(films: WatchlistFilm[], limit = 10): RankedBar[] {
  return rankMulti(films, (f) => f.genres, { limit, colorBy: "self" });
}

export function keywordBars(films: WatchlistFilm[], limit = 12, minCount = 3): RankedBar[] {
  return rankMulti(films, (f) => f.keywords, { limit, minCount });
}

export function countryBars(films: WatchlistFilm[], limit = 10): RankedBar[] {
  return rankMulti(films, (f) => f.production_countries, {
    limit,
    label: (iso) => countryName(iso),
  });
}

/**
 * Language is single-valued, so it goes through the same ranker with a one-item
 * list rather than a second counting path that could disagree with the first.
 */
export function languageBars(films: WatchlistFilm[], limit = 10): RankedBar[] {
  return rankMulti(films, (f) => (f.language ? [f.language] : []), {
    limit,
    label: languageName,
  });
}

export type DecadeBar = {
  decade: number;
  label: string;
  count: number;
  genre: GenreKey; // dominant primary genre among that decade's films
  color: string;
  /** Share of the films in view, 0-1. The denominator is every dated film. */
  share: number;
};

/**
 * Films per release decade, with the empty decades in between kept.
 *
 * A gap decade is rendered as a zero-height bar rather than dropped: the axis is
 * time, and closing the gaps would put 1920 next to 1950 and make a sparse run
 * look continuous. Films with no release year are excluded — every watchlist row
 * currently has one, so this only guards a future gap.
 */
export function decadeBars(films: WatchlistFilm[]): DecadeBar[] {
  const dated = films.filter((f) => f.year != null);
  if (dated.length === 0) return [];
  const years = dated.map((f) => f.year as number);
  const lo = Math.floor(Math.min(...years) / 10) * 10;
  const hi = Math.floor(Math.max(...years) / 10) * 10;

  const byDecade = new Map<number, WatchlistFilm[]>();
  for (const f of dated) {
    const d = Math.floor((f.year as number) / 10) * 10;
    const list = byDecade.get(d);
    if (list) list.push(f);
    else byDecade.set(d, [f]);
  }

  const out: DecadeBar[] = [];
  for (let d = lo; d <= hi; d += 10) {
    const fs = byDecade.get(d) ?? [];
    // An empty decade takes the neutral rather than a genre it has no films to
    // justify. Its share is 0, which is what the hover should say.
    const genre = fs.length ? dominantGenre(fs) : "Other";
    out.push({
      decade: d,
      // Full year, not the two-digit "10s" shorthand. The list runs from 1917 to
      // 2026, so the short form labels both the 1910s and the 2010s "10s" — two
      // columns a century apart carrying one name.
      label: `${d}s`,
      count: fs.length,
      genre,
      color: GENRE_COLORS[genre],
      share: fs.length / dated.length,
    });
  }
  return out;
}

/**
 * The headline numbers for the watchlist story.
 *
 * `watched` is reported because the list is not a clean backlog: Letterboxd
 * leaves a film on the watchlist after it is logged, and the reader clears them
 * only sometimes. Stating the count is the only honest way to use "waiting" in
 * the headline.
 */
export function watchlistSummary(films: WatchlistFilm[]) {
  const years = films.map((f) => f.year).filter((y): y is number => y != null);
  const watched = films.filter((f) => f.watched).length;
  const preMillennium = years.filter((y) => y < 2000).length;
  return {
    total: films.length,
    watched,
    unwatched: films.length - watched,
    oldest: years.length ? Math.min(...years) : null,
    newest: years.length ? Math.max(...years) : null,
    // Share of the list that predates 2000, the shape that actually
    // distinguishes this list. Of the whole list, not of the dated subset:
    // every row currently carries a year, and the two agree.
    preMillenniumShare: films.length ? preMillennium / films.length : 0,
  };
}

export type GenreDecadeCell = {
  genre: GenreKey;
  decade: number;
  count: number;
};

export type GenreDecadeGrid = {
  genres: GenreKey[]; // rows, in GENRE_ORDER, only those with any film
  decades: number[]; // columns, every decade in range including empty ones
  cells: Map<string, number>; // `${genre}|${decade}` -> count
  peak: number; // largest cell, for the colour ramp
};

/** Key for the cell map. Exported so the component cannot invent its own. */
export function cellKey(genre: GenreKey, decade: number): string {
  return `${genre}|${decade}`;
}

/**
 * Films per (primary genre x release decade).
 *
 * The bin is the same size everywhere by construction, which is the point: the
 * barcode places films at their true release date and so has no bins at all,
 * while the decade bars have bins but throw genre away. This is the grid between
 * them, and it is the only one of the three that can show an ABSENCE — no 1930s
 * horror waiting — because an empty cell is drawn rather than simply not there.
 *
 * One genre per film, via the site's primaryGenre, unlike the genre bar chart
 * which counts a film into every genre it carries. A film has to sit in exactly
 * one cell or the columns would not sum to the decade counts directly above.
 */
export function genreDecadeGrid(films: WatchlistFilm[]): GenreDecadeGrid {
  const dated = films.filter((f) => f.year != null);
  const empty: GenreDecadeGrid = { genres: [], decades: [], cells: new Map(), peak: 0 };
  if (dated.length === 0) return empty;

  const years = dated.map((f) => f.year as number);
  const lo = Math.floor(Math.min(...years) / 10) * 10;
  const hi = Math.floor(Math.max(...years) / 10) * 10;
  const decades: number[] = [];
  for (let d = lo; d <= hi; d += 10) decades.push(d);

  const cells = new Map<string, number>();
  const seen = new Set<GenreKey>();
  let peak = 0;
  for (const f of dated) {
    const g = primaryGenre(f);
    const d = Math.floor((f.year as number) / 10) * 10;
    const k = cellKey(g, d);
    const n = (cells.get(k) ?? 0) + 1;
    cells.set(k, n);
    seen.add(g);
    if (n > peak) peak = n;
  }

  // Rows keep GENRE_ORDER rather than sorting by volume, so the row a genre
  // occupies does not move when the filter changes.
  const genres = ([...GENRE_ORDER, "Other"] as GenreKey[]).filter((g) => seen.has(g));
  return { genres, decades, cells, peak };
}
