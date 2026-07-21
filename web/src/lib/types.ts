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
};

export type Dataset = { films: Film[]; watches: Watch[] };

// A watch joined to its film, with derived fields the charts need.
export type EnrichedWatch = Watch & {
  film: Film | undefined;
  d: Date;
  yearFrac: number; // 0..1 position within its calendar year
};
