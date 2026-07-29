import { ACCENT, GENRE_COLORS, primaryGenre, type GenreKey } from "./palette";
import type { Film } from "./types";

/**
 * The mark for a profile favorite, wherever one appears.
 *
 * Built the way the solstice sun is built: a shape rather than a color, so the
 * fact survives a reader who cannot separate the hues and a chart whose palette
 * is already spent on something else. Four films across eight hundred watches is
 * exactly the kind of fact that a color-only encoding loses.
 *
 * Colored by the film's primary genre rather than the house crimson, so a star
 * agrees with every other mark for that film on the page instead of competing
 * with it.
 */

/**
 * Outer radius to inner radius. The classic pentagram ratio: anything fatter
 * reads as a blob at the six pixel sizes these charts use.
 */
const INNER = 0.382;

export function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * INNER;
    // Starts at -90 degrees so the star always points up. Left to its own
    // devices the first vertex lands at 3 o'clock and the shape reads as tilted.
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/**
 * The genre color a favorite's star takes.
 *
 * "Other" falls back to the accent, the same exception `accentFor` makes and for
 * the same reason: its gray sits one step from the FADE used for everything
 * unselected, so a star drawn in it would be a highlight painted almost exactly
 * the color of the things it is supposed to stand out from.
 *
 * Takes the caller's active theme tokens; defaults to the light set so pure
 * callers (tests) see the same colors this function always returned.
 */
export function favColor(
  film: Film | undefined,
  tokens: { accent: string; genre: Record<GenreKey, string> } = {
    accent: ACCENT,
    genre: GENRE_COLORS,
  },
): string {
  const g = primaryGenre(film);
  return g === "Other" ? tokens.accent : tokens.genre[g];
}

export function StarMarker({
  x,
  y,
  r = 5,
  fill,
  opacity = 1,
}: {
  x: number;
  y: number;
  r?: number;
  fill: string;
  opacity?: number;
}) {
  return <path d={starPath(x, y, r)} fill={fill} fillOpacity={opacity} />;
}
