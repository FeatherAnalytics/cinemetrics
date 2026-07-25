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
