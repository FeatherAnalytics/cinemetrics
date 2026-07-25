"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import {
  GENRE_COLORS,
  INK,
  primaryGenre,
  secondaryGenre,
  type GenreKey,
} from "@/lib/palette";
import { GENRE_ALPHA, mean, tukey, type BoxBounds } from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { useWidth } from "@/lib/useWidth";
import { accentFor, isPicked, pickWatches } from "./pick";

const W0 = 720;
const W_MIN = 300;
const H = 290;
// Room above the 5-star tick for the n row, which sits at the TOP rather than
// under the genre label: on a bottom row it was the fourth thing the eye hit and
// it never lined up with the label it belonged to.
const MT = 32;
// Six columns fit horizontal labels, so the rotation the seventeen-genre version
// needed is gone along with the height it cost.
const MB = 34;
const ML = 34;
const FADE = "#b3b1a6";

type Row = BoxBounds & { genre: GenreKey; n: number; watches: EnrichedWatch[] };

/**
 * Rating distribution per genre, as standard Tukey box plots.
 *
 * The point of this chart is the CLUMPING: every genre's median lands on 70, 75
 * or 80, a spread of half a star across the whole library. Showing that needs a
 * handful of comparable columns, not seventeen.
 *
 * Genres are the five tracked in the filter rail plus Other, assigned by
 * `primaryGenre` so each film sits in exactly one column. The earlier version
 * counted a film in every genre it carried, which double-counted heavily (614 of
 * 676 films carry more than one) and, worse, meant clicking a column selected a
 * different set than picking that genre in the filter rail would.
 *
 * One value per FILM, not per watch, so a rewatched film counts once and cannot
 * drag its genre toward whatever it was rated on the third viewing.
 *
 * FILTERED TO GENRES, the axis becomes the SECONDARY genre. Grouping by primary
 * under a Horror filter draws one column called Horror, which is the filter
 * read back rather than an answer. The useful question at that point is what
 * else those films were, so the columns become Horror+Thriller, Horror+Drama
 * and so on. With several genres filtered a film qualifies if its PRIMARY is
 * any of them, so the columns stay a partition and each film is still counted
 * exactly once.
 */
export function RatingsByGenre() {
  const { filtered, filters, setSelection } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const accent = accentFor(filters.genres);
  const bySecondary = filters.genres.size > 0;

  const rows = useMemo(() => {
    const wanted = filters.genres as Set<string>;
    const useSecondary = wanted.size > 0;
    const byFilm = new Map<
      number,
      { ratings: number[]; watches: EnrichedWatch[]; genre: GenreKey }
    >();
    for (const w of filtered) {
      // Only films the filter is actually ABOUT drive the secondary axis: a
      // film that merely carries Horror further down its list belongs to
      // whichever genre won it, not to this breakdown.
      if (useSecondary && !wanted.has(primaryGenre(w.film))) continue;
      const e = byFilm.get(w.tmdb_id) ?? {
        ratings: [],
        watches: [],
        genre: useSecondary ? secondaryGenre(w.film) : primaryGenre(w.film),
      };
      if (w.rating != null) e.ratings.push(w.rating);
      e.watches.push(w);
      byFilm.set(w.tmdb_id, e);
    }

    const perGenre = new Map<GenreKey, { values: number[]; watches: EnrichedWatch[] }>();
    for (const [, e] of byFilm) {
      if (!e.ratings.length) continue;
      const slot = perGenre.get(e.genre) ?? { values: [], watches: [] };
      slot.values.push(mean(e.ratings));
      slot.watches.push(...e.watches);
      perGenre.set(e.genre, slot);
    }

    // Alphabetical, with Other last. A reader looks a genre up by name, so the
    // palette's priority order is the wrong axis order.
    return GENRE_ALPHA.filter((g) => perGenre.has(g)).map((genre) => {
      const v = perGenre.get(genre)!;
      return {
        genre,
        n: v.values.length,
        watches: v.watches,
        ...tukey([...v.values].sort((a, b) => a - b)),
      };
    }) as Row[];
  }, [filtered, filters.genres]);

  if (!rows.length) return null;

  const colW = (W - ML - 12) / rows.length;
  const boxW = Math.min(colW - 24, 56);
  const spread = Math.max(...rows.map((r) => r.med)) - Math.min(...rows.map((r) => r.med));
  const y = (v: number) => MT + (1 - v / 100) * (H - MT - MB);

  return (
    <div ref={ref}>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        {bySecondary ? "second genre · " : ""}median spread{" "}
        <span style={{ color: INK.primary }}>{(spread / 20).toFixed(2)}★</span>
      </div>
      <svg width={W} height={H} role="img" style={{ maxWidth: "100%" }}>
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <g key={t}>
            <line x1={ML} y1={y(t)} x2={W - 12} y2={y(t)} stroke="#eee" />
            <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
              {t / 20}★
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = ML + (i + 0.5) * colW;
          const on = isPicked(r.watches, filters.selection);
          return (
            <g key={r.genre}>
              {/* Whiskers run full length with the box painted over them opaque,
                  so only the tails outside the IQR show. */}
              <line x1={cx} y1={y(r.hi)} x2={cx} y2={y(r.lo)} stroke={FADE} />
              <line x1={cx - 5} y1={y(r.hi)} x2={cx + 5} y2={y(r.hi)} stroke={FADE} />
              <line x1={cx - 5} y1={y(r.lo)} x2={cx + 5} y2={y(r.lo)} stroke={FADE} />
              {/* Genre color carries identity, the way the cumulative chart's
                  bands do, so a column matches its chip in the filter rail. The
                  median is INK rather than the accent crimson: on the Horror box
                  a crimson median would disappear into its own fill. */}
              <rect
                x={cx - boxW / 2}
                y={y(r.q3)}
                width={boxW}
                height={Math.max(y(r.q1) - y(r.q3), 1)}
                fill={GENRE_COLORS[r.genre]}
                fillOpacity={on ? 0.85 : 0.5}
                stroke={on ? accent : "none"}
                strokeWidth={2}
              />
              <line
                x1={cx - boxW / 2}
                y1={y(r.med)}
                x2={cx + boxW / 2}
                y2={y(r.med)}
                stroke={INK.primary}
                strokeWidth={2}
              />
              {/* Hollow, so a cluster reads as several points rather than a blob. */}
              {r.outliers.map((v, oi) => (
                <circle
                  key={`o-${oi}`}
                  cx={cx}
                  cy={y(v)}
                  r={2}
                  fill="none"
                  stroke={INK.primary}
                  strokeWidth={0.8}
                />
              ))}
              <rect
                x={cx - colW / 2}
                y={MT}
                width={colW}
                height={H - MT - MB}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => pickWatches(r.watches, filters.selection, setSelection)}
              >
                <title>{`${r.genre}: ${r.n} films, median ${Math.round(r.med)}`}</title>
              </rect>
              <text
                x={cx}
                y={14}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={on ? accent : INK.secondary}
                pointerEvents="none"
              >
                {r.n}
              </text>
              <text
                x={cx}
                y={H - MB + 16}
                textAnchor="middle"
                fontSize={11}
                fill={on ? accent : INK.primary}
                fontWeight={on ? 700 : 400}
                pointerEvents="none"
              >
                {r.genre}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
