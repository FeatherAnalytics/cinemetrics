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
