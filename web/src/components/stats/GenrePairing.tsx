"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import { insetRect, lerpHex, mean, NO_DATA_STROKE } from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { useWidth } from "@/lib/useWidth";
import { isPicked, pickWatches } from "./pick";

const FADE = "#b3b1a6";
const MID = "#eceae3";
const BASE_FONT = 9;

// The matrix is square, so the cell size sets both dimensions: letting it run
// free would trade a wide column for a tall one. CELL_MIN is where a two-digit
// mean still fits; past CELL_MAX the grid is mostly gutter.
const CELL_MIN = 34;
const CELL_MAX = 52;
const PAD = 96; // gutter for the genre labels, rotated on top and flush right

const MIN_FILMS_PER_GENRE = 10;

// Below this many films a pair's mean rating is one film's opinion. Those cells
// still render, but in MID, and they are held OUT of the color and font domains:
// singleton pairs span 50 to 80 and were stretching the ramp so every ordinary
// pair landed mid-scale.
const MIN_FILMS_PER_PAIR = 2;

type Pair = { n: number; rating: number; watches: EnrichedWatch[] };

/** Crimson at the top of the range, fading to chrome gray at the bottom. */
function densityColor(share: number): string {
  return lerpHex(ACCENT, FADE, 1 - Math.max(0, Math.min(1, share)));
}

/**
 * Which genre combinations show up, and how they rate.
 *
 * Self-pairs are excluded, so every cell is a genuine combination rather than a
 * restatement of the single-genre count. Shade carries film count, the number is
 * the mean rating, and the number's SIZE scales with it too, so a strong pair is
 * legible without reading the digits.
 */
export function GenrePairing() {
  const { filtered, filters, setSelection } = useExplorer();
  const [ref, W] = useWidth(720);

  const model = useMemo(() => {
    const byFilm = new Map<number, { ratings: number[]; watches: EnrichedWatch[]; genres: string[] }>();
    for (const w of filtered) {
      const e = byFilm.get(w.tmdb_id) ?? { ratings: [], watches: [], genres: w.film?.genres ?? [] };
      if (w.rating != null) e.ratings.push(w.rating);
      e.watches.push(w);
      byFilm.set(w.tmdb_id, e);
    }

    const count = new Map<string, number>();
    for (const [, e] of byFilm) {
      if (!e.ratings.length) continue;
      for (const g of e.genres) count.set(g, (count.get(g) ?? 0) + 1);
    }
    const genres = [...count.entries()]
      .filter(([, n]) => n >= MIN_FILMS_PER_GENRE)
      .map(([g]) => g)
      .sort((a, b) => a.localeCompare(b));
    const kept = new Set(genres);

    const pairs = new Map<string, Pair>();
    for (const [, e] of byFilm) {
      if (!e.ratings.length) continue;
      const r = mean(e.ratings);
      const gs = e.genres.filter((g) => kept.has(g));
      // j starts past i, so a genre never pairs with itself.
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          const [a, b] =
            genres.indexOf(gs[i]) <= genres.indexOf(gs[j]) ? [gs[i], gs[j]] : [gs[j], gs[i]];
          const key = `${a}|${b}`;
          const prev = pairs.get(key) ?? { n: 0, rating: 0, watches: [] };
          pairs.set(key, {
            n: prev.n + 1,
            rating: (prev.rating * prev.n + r) / (prev.n + 1),
            watches: [...prev.watches, ...e.watches],
          });
        }
      }
    }
    return { genres, pairs };
  }, [filtered]);

  const { genres, pairs } = model;
  if (!genres.length) return null;

  const solid = [...pairs.values()].filter((v) => v.n >= MIN_FILMS_PER_PAIR);
  const ratings = solid.map((v) => v.rating);
  const lo = ratings.length ? Math.min(...ratings) : 0;
  const hi = ratings.length ? Math.max(...ratings) : 1;
  const maxN = Math.max(...[...pairs.values()].map((v) => v.n), 1);
  const share = (r: number) => (hi > lo ? Math.max(0, Math.min(1, (r - lo) / (hi - lo))) : 1);

  const pad = PAD;
  const cell = Math.max(
    CELL_MIN,
    Math.min(CELL_MAX, (W - pad - 10) / Math.max(genres.length, 1)),
  );
  const size = pad + genres.length * cell + 10;

  /**
   * Whether anything at all is drawn at (r, c).
   *
   * The outline is a PERIMETER around the occupied region, not a marker on
   * particular cells. It runs wherever a cell meets empty space, for every cell
   * regardless of how many films back it: against a neighbor the fill difference
   * already separates them, and a line there is pure noise (two adjacent
   * outlines also doubled into one heavy stroke).
   *
   * Applying it only to single-film cells left the region's edge outlined in
   * patches, which read as those cells being special in a way the perimeter
   * never meant. Low confidence is carried by the pale `#eceae3` fill alone,
   * which is what that color is for.
   */
  const isCell = (r: number, c: number): boolean => {
    if (r < 0 || c < 0 || r >= genres.length || c >= genres.length) return false;
    if (c < r) return false; // lower triangle is not drawn
    return pairs.has(`${genres[r]}|${genres[c]}`);
  };

  return (
    <div ref={ref}>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        shade = film count · number = mean rating · MIN N = {MIN_FILMS_PER_GENRE}
      </div>
      {/* Scrolls rather than shrinks below CELL_MIN: a matrix squeezed past the
          point its numbers fit is not a smaller chart, it is an unreadable one. */}
      <div className="overflow-x-auto">
        <svg width={size} height={size} role="img">
          {genres.map((g, i) => (
            <text
              key={`c${g}`}
              x={pad + i * cell + cell / 2}
              y={pad - 6}
              fontSize={9}
              fill={INK.muted}
              textAnchor="start"
              transform={`rotate(-55 ${pad + i * cell + cell / 2} ${pad - 6})`}
            >
              {g}
            </text>
          ))}
          {genres.map((g, r) => (
            <text
              key={`r${g}`}
              x={pad - 6}
              y={pad + r * cell + cell / 2 + 3}
              fontSize={9}
              fill={INK.muted}
              textAnchor="end"
            >
              {g}
            </text>
          ))}
          {genres.map((a, r) =>
            genres.map((b, c) => {
              if (c < r) return null;
              const v = pairs.get(`${a}|${b}`);
              if (!v) return null;
              const thin = v.n < MIN_FILMS_PER_PAIR;
              const on = isPicked(v.watches, filters.selection);
              const x = pad + c * cell;
              const yy = pad + r * cell;
              return (
                <g
                  key={`${a}-${b}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => pickWatches(v.watches, filters.selection, setSelection)}
                >
                  {/* Cells butt together: a gutter reads as a white grid drawn
                      over the data, which fights the density ramp. */}
                  <rect
                    x={x}
                    y={yy}
                    width={cell}
                    height={cell}
                    fill={thin ? MID : densityColor(v.n / maxN)}
                  />
                  {/* Perimeter edges, drawn per side and INSET so an outlined
                      cell measures exactly the same as a plain one. An edge
                      appears only where the cell meets empty space. */}
                  {(() => {
                      const i = NO_DATA_STROKE / 2;
                      const x0 = x + i;
                      const x1 = x + cell - i;
                      const y0 = yy + i;
                      const y1 = yy + cell - i;
                      const edges: [number, number, number, number][] = [];
                      if (!isCell(r - 1, c)) edges.push([x0, y0, x1, y0]);
                      if (!isCell(r + 1, c)) edges.push([x0, y1, x1, y1]);
                      if (!isCell(r, c - 1)) edges.push([x0, y0, x0, y1]);
                      if (!isCell(r, c + 1)) edges.push([x1, y0, x1, y1]);
                      return edges.map(([ax, ay, bx, by], ei) => (
                        <line
                          key={ei}
                          x1={ax}
                          y1={ay}
                          x2={bx}
                          y2={by}
                          stroke={INK.primary}
                          strokeWidth={NO_DATA_STROKE}
                        />
                      ));
                    })()}
                  {on && (
                    <rect
                      {...insetRect(x, yy, cell, cell)}
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={x + cell / 2 - 1}
                    y={yy + cell / 2 + 4}
                    textAnchor="middle"
                    fontSize={BASE_FONT * (1.1 + 0.9 * share(v.rating))}
                    fontWeight={700}
                    fill={thin ? INK.muted : v.n / maxN > 0.55 ? "#fff" : INK.primary}
                    pointerEvents="none"
                  >
                    {Math.round(v.rating)}
                  </text>
                  <title>{`${a} + ${b}: ${v.n} film${v.n === 1 ? "" : "s"}, mean ${Math.round(
                    v.rating,
                  )}`}</title>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}
