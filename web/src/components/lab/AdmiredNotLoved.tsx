"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { admiredNotLoved, lovedNotAdmired } from "@/lib/likedChart";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";

// Label gutter and TOTAL width copied from CountryBars and MostRewatched. The
// total matters as much as the gutter: the viewBox scales to the column, so a
// narrower one would blow BAR_H and the 12px titles up against their neighbors.
// At 462 this chart drew half again as large as every list above it.
//
// Those two charts spend their last 226 units on a mirrored second series. This
// one has nothing to put there, since the whole content of the chart is one bit
// per film, so the rating track takes the room instead.
const LABEL_W = 176;
const RATING_W = 512;
const WIDTH = LABEL_W + RATING_W;
const TOP_N = 12;
const INSIDE_MIN = 44;
const MAX_TITLE = 24;

function clipTitle(t: string): string {
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t;
}

/**
 * The asymmetry, recomputed against whatever the rail is showing.
 *
 * The claim only means something next to the list it sits above, so quoting the
 * full-library three under a Horror filter would describe films that are not on
 * the page.
 */
export function AdmiredNotLovedBlurb() {
  const { filtered } = useExplorer();
  const { cold, warm } = useMemo(
    () => ({
      cold: admiredNotLoved(filtered).length,
      warm: lovedNotAdmired(filtered),
    }),
    [filtered],
  );

  if (cold === 0 && warm === 0) return null;
  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      The films the two measures disagree about, and the disagreement runs one way:{" "}
      {cold} rated 80 or above went unhearted, against {warm} hearted at 65 or below.
    </p>
  );
}

/**
 * Films I rated highly and never hearted.
 *
 * The only place the two measures genuinely come apart, and it is one-sided: 57
 * films sit at 80 or above without the heart, against three hearted below 66.
 * There is no guilty-pleasure set in this data, so there is no mirrored second
 * series here the way "what I go back to" has one. A chart drawn for symmetry
 * that the data does not have would be inventing a category.
 *
 * Bars run against the full 0-100 rating scale rather than the local maximum, so
 * an 80 and a 90 read as the eight points apart that they are.
 */
export function AdmiredNotLoved() {
  const { filtered, filters, setSelection } = useExplorer();
  const [hover, setHover] = useState<number | null>(null);
  const accent = accentFor(filters.genres);

  const { rows, tailCount, tailMin, tailMax } = useMemo(() => {
    const all = admiredNotLoved(filtered);
    const tail = all.slice(TOP_N);
    return {
      rows: all.slice(0, TOP_N),
      tailCount: tail.length,
      tailMin: tail.length ? Math.min(...tail.map((f) => f.rating)) : 0,
      tailMax: tail.length ? Math.max(...tail.map((f) => f.rating)) : 0,
    };
  }, [filtered]);

  if (!rows.length) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        Nothing rated 80 or above went unhearted under this filter.
      </p>
    );
  }

  const HEIGHT = 20 + (rows.length + (tailCount > 0 ? 1 : 0)) * (BAR_H + GAP);
  const ratingLen = (r: number) => (r / 100) * RATING_W;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Films rated 80 or above that never got the Letterboxd heart, ranked by rating and colored by genre."
      >
        <text
          x={LABEL_W}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          MY RATING
        </text>

        {rows.map((f, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const on = isPicked(f.watches, filters.selection);
          const dim = filters.selection != null && !on;
          const len = ratingLen(f.rating);
          const inside = len > INSIDE_MIN;
          const genre = primaryGenre(f.watches[0].film);
          return (
            <g
              key={f.tmdb_id}
              style={{ cursor: "pointer" }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pickWatches(f.watches, filters.selection, setSelection)}
            >
              <rect x={0} y={y} width={WIDTH} height={BAR_H} fill="transparent" />
              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={on ? INK.primary : INK.secondary}
                fontSize={12}
                fontWeight={on ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {clipTitle(f.title)}
              </text>
              <rect
                x={LABEL_W}
                y={y}
                width={len}
                height={BAR_H}
                fill={on ? accent : GENRE_COLORS[genre]}
                fillOpacity={hover === i || on ? 0.9 : 0.72}
              />
              <text
                x={LABEL_W + len + (inside ? -8 : 8)}
                y={y + BAR_H / 2}
                fill={valueLabelFill(inside)}
                fontSize={11}
                fontWeight={700}
                textAnchor={inside ? "end" : "start"}
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {f.rating}
              </text>
            </g>
          );
        })}

        {/* The list stops at twelve and the twelfth is still an 80, so without
            this the chart implies the set ends there. */}
        {tailCount > 0 && (
          <text
            x={LABEL_W - 8}
            y={20 + rows.length * (BAR_H + GAP) + BAR_H / 2}
            fill={INK.muted}
            fontSize={11}
            textAnchor="end"
            dominantBaseline="middle"
          >
            + {tailCount} more at {tailMin === tailMax ? tailMin : `${tailMin}-${tailMax}`}
          </text>
        )}
      </svg>
    </figure>
  );
}
