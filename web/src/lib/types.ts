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

export type Dataset = { films: Film[]; watches: Watch[] };

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
