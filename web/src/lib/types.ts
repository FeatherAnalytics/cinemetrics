export type Film = {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  year: number | null;
  genres: string[];
  keywords: string[];
  runtime: number | null;
  budget: number | null;
  revenue: number | null;
  director: string | null;
  actors: string | null;
  metascore: number | null;
  rt_rating: number | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  production_countries: string[]; // ISO 3166-1 alpha-2 codes
  rated: string | null; // MPAA content rating (G/PG/PG-13/R/…)
  language: string | null; // TMDB original_language (ISO 639-1)
  collection: string | null; // TMDB franchise/collection name, if any
};

export type Watch = {
  date: string;
  tmdb_id: number;
  rating: number | null;
  stars: number | null;
  rewatch: boolean;
  /**
   * The Letterboxd heart. Carried on the watch, but a property of the FILM:
   * hearting is a single toggle per film, stamped onto every diary entry for
   * it, so all of a film's watches always share one value. Grouping by film and
   * expecting the heart to vary between viewings will always find that it does
   * not.
   *
   * NULL means UNKNOWN, not "not liked": the 129 pre-Letterboxd watches have no
   * like data at all. Filter nulls out before computing any rate, or the
   * denominator overstates by ~19%.
   */
  liked: boolean | null;
};

/**
 * A film on the Letterboxd watchlist. Deliberately NOT a `Film`: it has no
 * watches, no rating and no `liked`, so anything that walks `films` expecting a
 * viewing history would find none here.
 *
 * A SNAPSHOT, not history. `added` is the only date the export carries;
 * Letterboxd records nothing about films LEAVING the list, so no dwell time,
 * time-to-watch or conversion rate can be computed from this — the films that
 * would anchor the denominator are exactly the ones that vanished.
 */
export type WatchlistFilm = {
  tmdb_id: number;
  title: string;
  year: number | null;
  added: string; // ISO date the film was added to the list
  /**
   * True when the film has also been watched. Letterboxd does not clear a film
   * from the watchlist when it is logged, and the reader only sometimes does it
   * by hand, so the list is not a clean backlog. 6 of the current 136 are here.
   */
  watched: boolean;
  genres: string[];
  keywords: string[];
  runtime: number | null;
  production_countries: string[]; // ISO 3166-1 alpha-2 codes
  language: string | null; // TMDB original_language (ISO 639-1)
  director: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
};

// `watchlist` is optional so a payload written before dim_watchlist existed —
// or a test fixture that only cares about watches — still loads, and the
// watchlist story simply reports an empty list rather than throwing.
export type Dataset = { films: Film[]; watches: Watch[]; watchlist?: WatchlistFilm[] };

// A watch joined to its film, with derived fields the charts need.
export type EnrichedWatch = Watch & {
  film: Film | undefined;
  d: Date;
  yearFrac: number; // 0..1 position within its calendar year
};
