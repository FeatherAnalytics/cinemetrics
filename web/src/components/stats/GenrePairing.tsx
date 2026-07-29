"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { type GenreKey } from "@/lib/palette";
import { useTheme, type Tokens } from "@/lib/theme";
import { insetRect, lerpHex, mean, NO_DATA_STROKE } from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { useWidth } from "@/lib/useWidth";
import { accentFor, isPicked, pickWatches } from "./pick";

const BASE_FONT = 9;

// The matrix is square, so the cell size sets both dimensions: letting it run
// free would trade a wide column for a tall one. CELL_MIN is where a two-digit
// mean still fits; past CELL_MAX the grid is mostly gutter.
const CELL_MIN = 34;
const CELL_MAX = 52;
const PAD = 96; // gutter for the genre labels, rotated on top and flush right

/**
 * Axis labels carry the genre's own color where the site tracks one.
 *
 * Only five genres have an identity color; the matrix lists every genre with
 * ten or more films, so most axis labels stay muted. That asymmetry is the
 * point rather than a gap: the colored labels are exactly the ones a reader can
 * pick out of the filter rail, the cumulative bands and the box plots, so the
 * axis ties this chart to those without inventing twelve more colors nobody
 * could tell apart.
 */
function axisFill(genre: string, tokens: Tokens): string {
  return genre in tokens.genre && genre !== "Other"
    ? tokens.genre[genre as GenreKey]
    : tokens.ink.muted;
}

const MIN_FILMS_PER_GENRE = 10;

// Below this many films a pair's mean rating is one film's opinion. Those cells
// still render, but in the surface's well tint (from the active theme), and they
// are held OUT of the color and font domains: singleton pairs span 50 to 80 and
// were stretching the ramp so every ordinary pair landed mid-scale.
const MIN_FILMS_PER_PAIR = 2;

type Pair = { n: number; rating: number; watches: EnrichedWatch[] };

/** Crimson at the top of the range, fading to chrome gray at the bottom. */
function densityColor(share: number, accent: string, fade: string): string {
  return lerpHex(accent, fade, 1 - Math.max(0, Math.min(1, share)));
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
  const { tokens } = useTheme();
  const FADE = tokens.ink.grid;
  const MID = tokens.surface.well;
  const [ref, W] = useWidth(720);
  const accent = accentFor(filters.genres, tokens);
  const [hover, setHover] = useState<{ a: string; b: string; n: number; rating: number } | null>(
    null,
  );

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
  // Rendering nothing here read as "these films carry one genre each", which is
  // never true. What actually happened is that no genre cleared the threshold:
  // filtered to a nine-film collection, no genre can reach ten films no matter
  // how the films are tagged. Say that, the way the keyword chart does.
  //
  // A single surviving genre is the same situation one step along: a pairing
  // needs two, so the grid came out as one labeled row and column with no cell
  // in it, which looks like a rendering fault rather than an empty result.
  if (genres.length < 2 || pairs.size === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm"
        style={{ borderColor: `color-mix(in srgb, ${tokens.ink.primary} 15%, transparent)`, color: tokens.ink.muted }}
      >
        A pairing needs two genres of {MIN_FILMS_PER_GENRE}+ rated films, which is the
        threshold a pair needs before its mean rating means anything. This filter does not
        reach it. Widen the filters to bring more films in.
      </div>
    );
  }

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
   * never meant. Low confidence is carried by the pale surface-well tint
   * alone (from the active theme), which is what that color is for.
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
        style={{ color: tokens.ink.muted }}
      >
        {/* Hover reads out in the strip, in the site's own type, rather than in
            a browser `<title>` tooltip. The pair is named with a plain "+"
            because the cell is a combination, not a direction. */}
        {hover ? (
          <>
            <span style={{ color: axisFill(hover.a, tokens) }}>{hover.a}</span>
            {" + "}
            <span style={{ color: axisFill(hover.b, tokens) }}>{hover.b}</span>
            {" · "}
            <span style={{ color: tokens.ink.primary }}>
              {hover.n} film{hover.n === 1 ? "" : "s"} · {(hover.rating / 20).toFixed(1)}★
            </span>
          </>
        ) : (
          <>shade = film count · number = mean rating · MIN N = {MIN_FILMS_PER_GENRE}</>
        )}
      </div>
      {/* Scrolls rather than shrinks below CELL_MIN: a matrix squeezed past the
          point its numbers fit is not a smaller chart, it is an unreadable one. */}
      <div className="overflow-x-auto">
        <svg width={size} height={size} role="img">
          {/* Each axis title runs ALONG its own axis rather than stacking in the
              corner. Stacked, the two read as one phrase and the row title's
              arrow appeared to point at the column title instead of at the
              rows. Set on the axes they label, neither points at the other and
              no arrows are needed at all. */}
          <text
            x={pad}
            y={12}
            fontSize={8}
            fill={tokens.ink.muted}
            letterSpacing="0.1em"
            fontFamily="var(--font-mono)"
          >
            SECOND GENRE
          </text>
          <text
            x={0}
            y={0}
            fontSize={8}
            fill={tokens.ink.muted}
            letterSpacing="0.1em"
            fontFamily="var(--font-mono)"
            textAnchor="middle"
            transform={`translate(10 ${pad + (genres.length * cell) / 2}) rotate(-90)`}
          >
            FIRST GENRE
          </text>
          {genres.map((g, i) => (
            <text
              key={`c${g}`}
              x={pad + i * cell + cell / 2}
              y={pad - 6}
              fontSize={9}
              fill={axisFill(g, tokens)}
              fontWeight={axisFill(g, tokens) === tokens.ink.muted ? 400 : 700}
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
              fill={axisFill(g, tokens)}
              fontWeight={axisFill(g, tokens) === tokens.ink.muted ? 400 : 700}
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
                  onMouseEnter={() => setHover({ a, b, n: v.n, rating: v.rating })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => pickWatches(v.watches, filters.selection, setSelection)}
                >
                  {/* Cells butt together: a gutter reads as a white grid drawn
                      over the data, which fights the density ramp. */}
                  <rect
                    x={x}
                    y={yy}
                    width={cell}
                    height={cell}
                    fill={thin ? MID : densityColor(v.n / maxN, tokens.accent, FADE)}
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
                          stroke={tokens.ink.primary}
                          strokeWidth={NO_DATA_STROKE}
                        />
                      ));
                    })()}
                  {on && (
                    <rect
                      {...insetRect(x, yy, cell, cell)}
                      fill="none"
                      stroke={accent}
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={x + cell / 2 - 1}
                    y={yy + cell / 2 + 4}
                    textAnchor="middle"
                    fontSize={BASE_FONT * (1.1 + 0.9 * share(v.rating))}
                    fontWeight={700}
                    fill={thin ? tokens.ink.muted : v.n / maxN > 0.55 ? "#fff" : tokens.ink.primary}
                    pointerEvents="none"
                  >
                    {Math.round(v.rating)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}
