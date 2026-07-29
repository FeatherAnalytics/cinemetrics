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
 * The split was OMDb's "Sci-Fi" against TMDB's "Science Fiction", and it is now
 * settled UPSTREAM: transform/macros/canonical_genres.sql rewrites both halves
 * to "Sci-Fi" in staging, so the exported data carries one spelling and this map
 * matches nothing in practice.
 *
 * It stays as a guard rather than being deleted. The export is a build artefact
 * a reader may hold a stale copy of, and a chart that silently shows no
 * deviation is a harder failure to notice than one that quietly agrees with the
 * pipeline. Genres unique to one source (OMDb's Biography, Film-Noir, Short) are
 * left alone: there is nothing on the other side to join them to.
 */
const GENRE_ALIASES: Record<string, string> = {
  "Science Fiction": "Sci-Fi",
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

/**
 * Three paper tones.
 *
 * The landing page felt flat because every section sat on one surface with no
 * edge between them — not because the charts were grey. Depth was the missing
 * thing, and it costs no saturation.
 */
export const SURFACE = {
  well: "#eeece4",
  paper: "#f7f6f3",
  card: "#fdfdfb",
};

// Chart chrome (light mode). Chrome is deliberately darker than the validated
// hairline defaults so lines and labels read clearly on the light surface.
export const INK = {
  primary: "#0b0b0b",
  secondary: "#3d3c38",
  muted: "#67655f",
  grid: "#b3b1a6",
  axis: "#7c7a71",
  // Chart marks sit on the CARD, not the page ground — these are the fills that
  // punch a hole in a mark, so they have to match what is behind it.
  surface: SURFACE.card,
  plane: SURFACE.card,
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

/**
 * UI state, deliberately without hue.
 *
 * ACCENT is GENRE_COLORS.Horror. When an active toggle also painted itself
 * crimson, the same colour meant "this control is on" and "this film is
 * Horror" a few centimetres apart in the sidebar, and a crimson selection ring
 * vanished against a crimson Horror mark. Ink separates the two with no new hue
 * to defend against the five genre slots.
 *
 * Crimson stays on DATA only: genre identity, the diverging ramp, the heart.
 */
export const UI = {
  active: "#232220",
  activeText: "#f7f6f3",
  /** Selection outline. Ink, so it reads on a mark of any genre colour. */
  selected: "#0b0b0b",
};

/**
 * The dark counterpart.
 *
 * Not an inversion: #c01023 against a near-black ground falls under 3:1, and the
 * same is true of Drama's blue and Comedy's green. Every hue lifts in lightness
 * while keeping its identity, so a Horror mark still reads as the same colour it
 * is in light mode.
 */
export const DARK = {
  accent: "#ff4757",
  genre: {
    Horror: "#ff4757",
    Thriller: "#ffc043",
    Drama: "#5aa2f5",
    Comedy: "#3ab54a",
    Adventure: "#a97ae8",
    Other: "#8a877d",
  } as Record<GenreKey, string>,
  ink: {
    primary: "#f2f0ea",
    secondary: "#b6b3a9",
    muted: "#86837a",
    grid: "#3a3833",
    axis: "#5c5a53",
    surface: "#1c1b17",
    plane: "#1c1b17",
  },
  surface: {
    well: "#131210",
    paper: "#171613",
    card: "#1c1b17",
  },
  ui: {
    active: "#f2f0ea",
    activeText: "#131210",
    selected: "#f2f0ea",
  },
};
