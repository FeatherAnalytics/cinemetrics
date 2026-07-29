import { INK } from "./palette";

// Shared geometry for the horizontal-bar charts (CountryBars, KeywordBars).
// Only the dimensions that are identical across both live here; per-chart widths
// (LABEL_W / BAR_W / VALUE_W) stay local because they differ.
export const BAR_H = 24;
export const GAP = 4;

/**
 * Value-label appearance for a bar: inside the bar it reads on the paper
 * surface, outside it reads in primary ink. Callers still position it (x,
 * textAnchor) themselves, since bar direction differs per chart.
 *
 * `ink` defaults to the light set so pure callers (tests) see the same colors
 * this function always returned; the chart passes the active theme's.
 */
export function valueLabelFill(
  inside: boolean,
  ink: { surface: string; primary: string } = INK,
): string {
  return inside ? ink.surface : ink.primary;
}
