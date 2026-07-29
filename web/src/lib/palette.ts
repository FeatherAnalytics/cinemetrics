import type { Film } from "./types";

/**
 * Anything with a genre list. Widened from `Film` so watchlist films — which
 * carry genres but no watch history — colour by the same rule as watched ones,
 * rather than through a parallel copy of it that could drift.
 */
type HasGenres = { genres: string[] };

// Genre identity colors: validated categorical slots 1-5 + neutral "Other".
// (Validated all-pairs with scripts/validate_palette.js; the crimson/green pair
// is a known deuteranopia collision the labels + hover mitigate — identity is
// never color-alone. Adventure (violet) added as slot 5, well separated from
// the rest.) Adventure sits last in GENRE_ORDER, so it only claims films that
// carry none of the earlier four.
//
// Comedy and Thriller trade slots: amber reads as the lighter genre and green as
// the colder one. The color SET is unchanged, only the assignment, so the
// all-pairs validation still holds and needs no re-run. It does move the
// crimson/green deuteranopia collision from Horror/Thriller to Horror/Comedy.
export const GENRE_ORDER = ["Horror", "Thriller", "Drama", "Comedy", "Adventure"] as const;
export type GenreKey = (typeof GENRE_ORDER)[number] | "Other";

export const GENRE_COLORS: Record<GenreKey, string> = {
  Horror: "#c01023",
  Thriller: "#eda100",
  Drama: "#2a78d6",
  Comedy: "#008300",
  Adventure: "#7b2cbf",
  Other: "#898781",
};

export const GENRE_KEYS: GenreKey[] = [...GENRE_ORDER, "Other"];

/**
 * One spelling for genres the two sources name differently.
 *
 * Watched films take their genres from OMDb, watchlist films from TMDB, and the
 * two vocabularies agree on everything except science fiction: OMDb writes
 * "Sci-Fi" (68 watched films), TMDB writes "Science Fiction" (25 on the list).
 * Any join by genre name therefore missed that pair entirely — the watchlist's
 * Science Fiction row showed no rating deviation at all, not because nothing had
 * been watched but because the 68 films were filed under another name.
 *
 * TMDB's spelling wins because it is what the watchlist charts print. Genres
 * unique to one source (OMDb's Biography, Film-Noir, Short) are left alone:
 * there is nothing on the other side to join them to.
 */
const GENRE_ALIASES: Record<string, string> = {
  "Sci-Fi": "Science Fiction",
};

export function canonicalGenre(name: string): string {
  return GENRE_ALIASES[name] ?? name;
}

// A film's dominant genre for coloring: first of the tracked genres it carries
// (Horror wins when present, which is what the seasonality story turns on).
export function primaryGenre(film: HasGenres | undefined): GenreKey {
  const gs = film?.genres ?? [];
  for (const g of GENRE_ORDER) if (gs.includes(g)) return g;
  return "Other";
}

/**
 * The next tracked genre after the primary, by the same priority order.
 *
 * Answers "what else is this, once you already know it's Horror". Returns
 * "Other" for a film that carries only one tracked genre, which is a real
 * answer rather than a gap: 62 of the 676 films are single-genre.
 */
export function secondaryGenre(film: Film | undefined): GenreKey {
  const gs = film?.genres ?? [];
  const hits = GENRE_ORDER.filter((g) => gs.includes(g));
  return hits[1] ?? "Other";
}

// Chart chrome (light mode). Chrome is deliberately darker than the validated
// hairline defaults so lines and labels read clearly on the light surface.
export const INK = {
  primary: "#0b0b0b",
  secondary: "#3d3c38",
  muted: "#67655f",
  grid: "#b3b1a6",
  axis: "#7c7a71",
  surface: "#f7f6f3",
  plane: "#f7f6f3",
};

// The single accent — crimson. Used only for emphasis: selection, active
// controls, and the agreement axis. Spent in one place, on purpose.
export const ACCENT = "#c01023";

// Diverging poles for the streak barcode: crimson = above my average, blue =
// below, pale = at par. WARM reuses the accent crimson and COOL the Drama blue;
// MID is a neutral tint of the paper surface so "we agree" recedes.
export const DIVERGE_WARM = ACCENT;
export const DIVERGE_COOL = GENRE_COLORS.Drama;
export const DIVERGE_MID = "#eceae3";
