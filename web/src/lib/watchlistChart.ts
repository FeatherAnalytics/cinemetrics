// Pure helpers behind the watchlist charts. Kept out of the components for the
// same reason as statsChart.ts: a miscount here would not break the render, it
// would just put a wrong number on the page.

import { countryName } from "./countries";
import { languageName } from "./languages";
import { GENRE_COLORS, GENRE_KEYS, type GenreKey } from "./palette";
import type { WatchlistFilm } from "./types";

export type RankedBar = {
  key: string; // the filter value (ISO code, genre name, keyword)
  label: string; // what the reader sees
  count: number;
  color: string;
};

// Anything outside the five tracked genres shares one neutral. The genre
// palette is an identity scale with five slots; stretching it to the ~19 TMDB
// genres would mean inventing colours that carry no meaning anywhere else.
const NEUTRAL = GENRE_COLORS.Other;

function isTracked(name: string): name is GenreKey {
  return (GENRE_KEYS as string[]).includes(name);
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
  opts: { limit?: number; minCount?: number; label?: (key: string) => string } = {},
): RankedBar[] {
  const { limit = 10, minCount = 1, label = (k) => k } = opts;
  const counts = new Map<string, number>();
  for (const f of films) {
    // A value listed twice on one film still counts once: the question is how
    // many FILMS carry it.
    for (const v of new Set(pick(f))) {
      const key = v.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      label: label(key),
      count,
      color: isTracked(key) ? GENRE_COLORS[key] : NEUTRAL,
    }));
}

export function genreBars(films: WatchlistFilm[], limit = 10): RankedBar[] {
  return rankMulti(films, (f) => f.genres, { limit });
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

export type DecadeBar = { decade: number; label: string; count: number };

/**
 * Films per release decade, with the empty decades in between kept.
 *
 * A gap decade is rendered as a zero-height bar rather than dropped: the axis is
 * time, and closing the gaps would put 1920 next to 1950 and make a sparse run
 * look continuous. Films with no release year are excluded — every watchlist row
 * currently has one, so this only guards a future gap.
 */
export function decadeBars(films: WatchlistFilm[]): DecadeBar[] {
  const years = films.map((f) => f.year).filter((y): y is number => y != null);
  if (years.length === 0) return [];
  const lo = Math.floor(Math.min(...years) / 10) * 10;
  const hi = Math.floor(Math.max(...years) / 10) * 10;
  const counts = new Map<number, number>();
  for (const y of years) {
    const d = Math.floor(y / 10) * 10;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: DecadeBar[] = [];
  for (let d = lo; d <= hi; d += 10) {
    // Full year, not the two-digit "10s" shorthand. The list runs from 1917 to
    // 2026, so the short form labels both the 1910s and the 2010s "10s" — two
    // columns a century apart carrying one name.
    out.push({ decade: d, label: `${d}s`, count: counts.get(d) ?? 0 });
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
