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
  /**
   * TMDB poster path, e.g. "/abc123.jpg", or null when TMDB serves none.
   * Build the URL with posterUrl() in lib/fourFavs.ts — the CDN host and size
   * segment are a rendering choice, not data.
   */
  poster: string | null;
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
  /**
   * Full TMDB release date, for the barcode's time axis. Null for the six films
   * TMDB serves no date for; `year` still covers those, so the axis falls back
   * to January 1 rather than dropping them.
   */
  released: string | null;
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
  /**
   * TMDB's audience score, 0-10, and the votes behind it.
   *
   * Kept alongside the OMDb-sourced imdb_* pair rather than replacing it because
   * they are different measurements from different crowds. This one is here for
   * coverage: OMDb answers for 34 of the 136 films on the list, TMDB for 130.
   */
  tmdb_rating: number | null;
  tmdb_votes: number | null;
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
  /**
   * The heart, recovered to film level: `liked` when the row recorded it, and
   * otherwise the value carried by another watch of the SAME FILM.
   *
   * Because hearting is one toggle per film rather than per viewing, a sheet-era
   * row whose film was watched again later is not unknown at all. That recovers 31
   * of the 129 rows and moves the affection rate from 46.3% to 47.3%.
   *
   * Still null for the 98 rows whose films were never watched again, so this is
   * narrower than `liked` in meaning and wider in coverage. Rates use THIS field;
   * `liked` stays exactly as the pipeline recorded it.
   *
   * ⚠️ NOT an era marker. `hasKnownRewatchState` keys off raw `liked` on purpose:
   * these 31 rows are still sheet-era and still recorded no rewatch flag.
   */
  heart: boolean | null;
};
