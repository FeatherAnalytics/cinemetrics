import { ACCENT } from "./palette";
import type { EnrichedWatch } from "./types";

// Midsommar, watched on the 2024 summer solstice — the one watch that earns a
// sun wherever it appears.
export const SOLSTICE_WATCH = { tmdb_id: 530385, date: "2024-06-20" };

export function isSolstice(w: EnrichedWatch): boolean {
  return w.tmdb_id === SOLSTICE_WATCH.tmdb_id && w.date === SOLSTICE_WATCH.date;
}

/**
 * A crimson sun: core dot plus eight rays. Sized by `r` (the core radius);
 * rays reach r + 3.8. Pointer handlers belong on the parent group.
 *
 * `accent` defaults to the light constant so pure callers (tests) see the same
 * color this always drew; the chart passes the active theme's.
 */
export function SunMarker({
  x,
  y,
  r = 3.2,
  accent = ACCENT,
}: {
  x: number;
  y: number;
  r?: number;
  accent?: string;
}) {
  const rays = Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return (
      <line
        key={k}
        x1={x + (r + 1.3) * Math.cos(a)}
        y1={y + (r + 1.3) * Math.sin(a)}
        x2={x + (r + 3.8) * Math.cos(a)}
        y2={y + (r + 3.8) * Math.sin(a)}
        stroke={accent}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    );
  });
  return (
    <>
      {rays}
      <circle cx={x} cy={y} r={r} fill={accent} />
    </>
  );
}
