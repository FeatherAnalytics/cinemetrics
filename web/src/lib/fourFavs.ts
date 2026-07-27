import type { EnrichedWatch } from "./types";

/**
 * The four favorites, in order, for the "Four Favs" story.
 *
 * Curated by hand, so it is a constant rather than something derived: these are
 * not simply the four highest-rated films and no query would reproduce the list.
 *
 * `tmdb_id` is the key everything else in the pipeline uses. It was resolved from
 * the Letterboxd short link by reading the outbound TMDB anchor off each film
 * page (`ingest/letterboxd_film_page.py`), which is exact rather than a title
 * search, and all four came back `content_type: "movie"`.
 */
export type Fav = {
  tmdb_id: number;
  /** boxd.it short id, kept so the mapping can be re-verified. */
  letterboxd: string;
  title: string;
};

export const FOUR_FAVS: Fav[] = [
  { tmdb_id: 393519, letterboxd: "dLd2", title: "Raw" },
  { tmdb_id: 361292, letterboxd: "cioI", title: "Suspiria" },
  { tmdb_id: 4977, letterboxd: "23wW", title: "Paprika" },
  { tmdb_id: 290250, letterboxd: "94Hg", title: "The Nice Guys" },
];

export const FAV_IDS: ReadonlySet<number> = new Set(FOUR_FAVS.map((f) => f.tmdb_id));

/* ---------------------------------------------------------------- poster art */

/**
 * Chosen poster art per favorite, as a TMDB image path.
 *
 * These are TMDB paths, not a second source, which is what makes them free of a
 * licensing question the project has not already answered: the same API terms and
 * the same attribution cover them. Fan-art sites would have been the intuitive
 * place to look for alternates and the wrong one, since most of that work is an
 * unlicensed derivative of the studio art rather than a cleaner license.
 *
 * A film with no entry here falls back to whatever `poster_path` the pipeline
 * carries, which is TMDB's default pick for it.
 */
const FAV_POSTERS: Record<number, string> = {
  // Alternates, chosen over TMDB's default pick. Verified present in TMDB's image
  // set for each film, so they carry no license the project has not already
  // accepted: Suspiria's is the Japanese release art (1200x1692), Raw's an English
  // sheet at 2000x3000.
  361292: "/uaZSq2EdzNLwGS2Cba5VfespvyM.jpg", // Suspiria (2018)
  393519: "/6kXW9b1FZXvB3l0mLMDbKwGgL3P.jpg", // Raw
  // TMDB's own default art for these two, confirmed identical to their
  // `poster_path`. Pinned here only because that column is not in the export yet;
  // once it is, these two lines can go and the fallback covers them.
  4977: "/bLUUr474Go1DfeN1HLjE3rnZXBq.jpg", // Paprika
  290250: "/clq4So9spa9cXk3MZy2iMdqkxP2.jpg", // The Nice Guys
};

/**
 * The width TMDB is asked for.
 *
 * `original` is frequently a 2000px, multi-megabyte file: right for a print
 * reference and wrong for four thumbnails on a static page. Fixed rather than a
 * parameter, because one caller wants one size and a parameter nobody varies is
 * just a wider signature.
 */
const POSTER_WIDTH = "w342";

export function posterUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${POSTER_WIDTH}${path}`;
}

/** The path to draw for a film: the curated choice first, the pipeline's second. */
export function favPosterPath(
  tmdb_id: number,
  fallback?: string | null,
): string | null {
  return FAV_POSTERS[tmdb_id] ?? fallback ?? null;
}

/**
 * Membership is by `tmdb_id` and must never be by title.
 *
 * The library holds two films called Suspiria: the 2018 Guadagnino, which is a
 * favorite and rated 100 across eight watches, and the 1977 Argento, which is
 * rated 90 and is not. A title match would fold them into one row and hand the
 * favorite's crimson to both.
 */
export function isFav(tmdb_id: number): boolean {
  return FAV_IDS.has(tmdb_id);
}

/* ------------------------------------------------------ films at the ceiling */

export type CeilingFilm = {
  tmdb_id: number;
  /** Title, carrying its year only when another film on the chart shares it. */
  label: string;
  rating: number;
  watches: EnrichedWatch[];
  fav: boolean;
};

type Ceiling = {
  /** The top rating actually present, or null when nothing here is rated. */
  rating: number | null;
  films: CeilingFilm[];
};

/**
 * Every film tied at the highest rating present, ordered by how often I returned
 * to it.
 *
 * The point of the set is that it is a TIE. Rating cannot single out the four
 * favorites, because nineteen films sit at 100 and only four of them are on the
 * profile. Ordering by watch count then tests the obvious second theory and
 * fails it too: Midsommar has seven watches at 100 and is not a favorite, while
 * Paprika has two and is.
 *
 * The ceiling is the top rating IN VIEW rather than a hardcoded 100, so a filter
 * that contains nothing rated 100 still draws its own best films instead of an
 * empty chart. That makes the caption's job to say which value it found.
 */
export function ceilingFilms(watches: EnrichedWatch[]): Ceiling {
  const byFilm = new Map<number, EnrichedWatch[]>();
  for (const w of watches) {
    if (w.rating == null) continue;
    const bucket = byFilm.get(w.tmdb_id);
    if (bucket) bucket.push(w);
    else byFilm.set(w.tmdb_id, [w]);
  }

  let top: number | null = null;
  const filmTop = new Map<number, number>();
  for (const [id, ws] of byFilm) {
    // Highest rating across the film's watches, matching how the rewatch charts
    // collapse a film: the heart does not vary between viewings, and neither should
    // the film's place on a rating axis.
    const best = Math.max(...ws.map((w) => w.rating as number));
    filmTop.set(id, best);
    if (top == null || best > top) top = best;
  }
  if (top == null) return { rating: null, films: [] };

  const at = [...byFilm].filter(([id]) => filmTop.get(id) === top);

  // Disambiguate only where it is needed. Appending the year to every row would
  // spend label width on 18 films to separate 2, and the year is not what the
  // chart is about.
  const titleCount = new Map<string, number>();
  for (const [, ws] of at) {
    const t = ws[0].film?.title ?? "Unknown";
    titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
  }

  const films: CeilingFilm[] = at.map(([id, ws]) => {
    const title = ws[0].film?.title ?? "Unknown";
    const year = ws[0].film?.year;
    return {
      tmdb_id: id,
      label: (titleCount.get(title) ?? 0) > 1 && year != null ? `${title} (${year})` : title,
      rating: top as number,
      watches: ws,
      fav: isFav(id),
    };
  });

  films.sort((a, b) => b.watches.length - a.watches.length || a.label.localeCompare(b.label));
  return { rating: top, films };
}

/* -------------------------------------------------- what else by that director */

export type CohortFilm = {
  tmdb_id: number;
  title: string;
  rating: number | null;
  watches: EnrichedWatch[];
};

type FavCohort = {
  director: string;
  fav: CohortFilm;
  /** Everything else by that director that I watched. */
  others: CohortFilm[];
};

/**
 * Each favorite alongside the rest of its director's work that I have watched.
 *
 * Called a cohort and not a pair even though `others` currently holds exactly one
 * film for all four. That is a fact about the data today, not a shape: one more
 * Ducournau watch turns it into two, and a type that promised a pair would have
 * to be rewritten to admit it.
 *
 * Favorites with no director recorded are dropped rather than grouped under a
 * null key, which would collect unrelated films into one false cohort.
 */
export function favDirectorCohorts(watches: EnrichedWatch[]): FavCohort[] {
  const byFilm = new Map<number, EnrichedWatch[]>();
  for (const w of watches) {
    const bucket = byFilm.get(w.tmdb_id);
    if (bucket) bucket.push(w);
    else byFilm.set(w.tmdb_id, [w]);
  }

  const asFilm = (id: number, ws: EnrichedWatch[]): CohortFilm => {
    const rated = ws.map((w) => w.rating).filter((r): r is number => r != null);
    return {
      tmdb_id: id,
      title: ws[0].film?.title ?? "Unknown",
      rating: rated.length ? Math.max(...rated) : null,
      watches: ws,
    };
  };

  const out: FavCohort[] = [];
  for (const fav of FOUR_FAVS) {
    const favWatches = byFilm.get(fav.tmdb_id);
    if (!favWatches) continue;
    const director = favWatches[0].film?.director;
    if (!director) continue;

    const others: CohortFilm[] = [];
    for (const [id, ws] of byFilm) {
      if (id === fav.tmdb_id) continue;
      if (ws[0].film?.director !== director) continue;
      others.push(asFilm(id, ws));
    }
    others.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title));
    out.push({ director, fav: asFilm(fav.tmdb_id, favWatches), others });
  }
  return out;
}
