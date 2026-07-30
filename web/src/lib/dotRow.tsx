"use client";

import { useMemo, type ReactNode } from "react";
import { useAnimatedValues } from "./useAnimatedValues";
import type { Tokens } from "./theme";
import type { EnrichedWatch } from "./types";

/**
 * The geometry behind the two dot-per-watch row charts.
 *
 * `RewatchCadence` gives a row to a film and `FranchiseRuns` to a collection,
 * but a row is the same object either way: a label on the left, a line through
 * every viewing in date order, a dot on each, and a figure on the right. These
 * five constants and the two scales below them were byte-identical copies in
 * the two files before they lived here.
 *
 * Only what the scales close over is here. A chart's own top margin is its own
 * business and stays in its file.
 */
const W = 900;
const LABEL = 150;
const RIGHT = 64; // room for the right-hand figure (a rating move, or a franchise average)
const ROWH = 20;
const PAD = 3; // vertical padding inside each row band

export { W, LABEL, RIGHT, ROWH };

// Pure, so the row component can memoise on the numbers that feed it rather
// than on a closure the parent rebuilds every render.
export function yAt(rating: number | null, rowTop: number, lo: number, hi: number): number {
  const top = rowTop + PAD;
  const bot = rowTop + ROWH - PAD;
  if (rating == null) return (top + bot) / 2;
  return bot - ((rating - lo) / (hi - lo || 1)) * (bot - top);
}

export function xAt(t: number, x0: number, x1: number): number {
  return LABEL + ((t - x0) / (x1 - x0 || 1)) * (W - LABEL - RIGHT);
}

/**
 * One row, its own component so it can hold its own tween.
 *
 * The chart as a whole cannot: a filter changes how many rows there are, and
 * `useAnimatedValues` snaps on a length change, correctly, because pairing dot
 * n of one row set with dot n of another would animate a lie. Per row the
 * pairing is real. A genre filter is a fact about FILMS, so a surviving row
 * keeps every viewing it had, while its dots move for two reasons that have
 * nothing to do with its own data: rows above it left, so its band slid up,
 * and the shared rating scale refit around whatever is still on screen.
 *
 * Module scope, so a hover does not remount every row.
 *
 * CALLER REQUIREMENT, inherited from `useAnimatedValues`: `watches` is compared
 * by identity, all the way up. A caller that rebuilds the array for a row whose
 * viewings did not change restarts that row's tween every frame and the dots
 * never move. Both callers hold their rows in a `useMemo` for this reason.
 *
 * What the two charts do differently arrives as values -- the dot, the label,
 * the right-hand figure, how the line is stroked, and whether the whole row is
 * clickable. None of it is a mode this component branches on.
 */
export function DotRow({
  watches,
  rowTop,
  lo,
  hi,
  x0,
  x1,
  tokens,
  selected,
  label,
  line,
  dot,
  rightLabel,
  leader,
  onSelect,
}: {
  watches: EnrichedWatch[];
  rowTop: number;
  lo: number;
  hi: number;
  x0: number;
  x1: number;
  tokens: Tokens;
  /** Tints the row's band and darkens its label. */
  selected: boolean;
  label: ReactNode;
  line: { stroke: string; width: number; opacity: number };
  /** Draws one watch. Owns its own key, and its own pointer handlers. */
  dot: (w: EnrichedWatch, j: number, x: number, y: number) => ReactNode;
  /** The figure on the right, or null for a row with none to show. */
  rightLabel: ReactNode;
  /** Emphasises that figure. Both charts sort their rows, so it marks the leader. */
  leader: boolean;
  /** Set when the whole row is clickable. The franchise chart clicks per dot instead. */
  onSelect?: () => void;
}) {
  // x is the date and never tweens. Memoised on numbers only: the hook compares
  // its target by identity, and the parent re-renders on every hover.
  const xs = useMemo(() => watches.map((w) => xAt(w.d.getTime(), x0, x1)), [watches, x0, x1]);
  const ys = useMemo(
    () => watches.map((w) => yAt(w.rating, rowTop, lo, hi)),
    [watches, rowTop, lo, hi],
  );
  const drawnY = useAnimatedValues(ys);

  const poly = xs.map((x, j) => `${x},${drawnY[j]}`).join(" ");
  const labelY = rowTop + ROWH / 2;

  return (
    <g style={onSelect ? { cursor: "pointer" } : undefined} onClick={onSelect}>
      {selected && (
        <rect x={0} y={rowTop} width={W} height={ROWH} fill={tokens.ui.selected} fillOpacity={0.06} />
      )}
      <text
        x={LABEL - 8}
        y={labelY}
        fill={selected ? tokens.ink.primary : tokens.ink.muted}
        fontSize={9}
        textAnchor="end"
        dominantBaseline="middle"
      >
        {label}
      </text>
      <polyline
        points={poly}
        fill="none"
        stroke={line.stroke}
        strokeWidth={line.width}
        strokeOpacity={line.opacity}
      />
      {watches.map((w, j) => dot(w, j, xs[j], drawnY[j]))}
      {rightLabel != null && (
        <text
          x={W - 4}
          y={labelY}
          fill={leader ? tokens.ink.primary : tokens.ink.muted}
          fontSize={9}
          fontWeight={leader ? 700 : 400}
          textAnchor="end"
          dominantBaseline="middle"
        >
          {rightLabel}
        </text>
      )}
    </g>
  );
}
