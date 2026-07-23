import type { Film } from "./types";

// Genre identity colours: validated categorical slots 1-5 + neutral "Other".
// (Validated all-pairs with scripts/validate_palette.js; the crimson/green pair
// is a known deuteranopia collision the labels + hover mitigate — identity is
// never colour-alone. Adventure (violet) added as slot 5, well separated from
// the rest.) Adventure sits last in GENRE_ORDER, so it only claims films that
// carry none of the earlier four.
export const GENRE_ORDER = ["Horror", "Thriller", "Drama", "Comedy", "Adventure"] as const;
export type GenreKey = (typeof GENRE_ORDER)[number] | "Other";

export const GENRE_COLORS: Record<GenreKey, string> = {
  Horror: "#c01023",
  Thriller: "#008300",
  Drama: "#2a78d6",
  Comedy: "#eda100",
  Adventure: "#7b2cbf",
  Other: "#898781",
};

export const GENRE_KEYS: GenreKey[] = [...GENRE_ORDER, "Other"];

// A film's dominant genre for colouring: first of the tracked genres it carries
// (Horror wins when present, which is what the seasonality story turns on).
export function primaryGenre(film: Film | undefined): GenreKey {
  const gs = film?.genres ?? [];
  for (const g of GENRE_ORDER) if (gs.includes(g)) return g;
  return "Other";
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
