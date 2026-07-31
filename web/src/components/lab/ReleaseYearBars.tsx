"use client";

import { useMemo, useState } from "react";
import { hairline, useTheme } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import {
  overallFilmMean,
  releaseYearBars,
  THIN_N,
  THIN_OPACITY,
  type Stat,
} from "@/lib/yearQuality";
import type { Dataset } from "@/lib/types";

const W0 = 720; // pre-measurement width, matching the usual desktop column
const W_MIN = 300;

/**
 * One rating statistic per release year, as a column per year.
 *
 * The mean and the median chart are the same drawing with a different reduction,
 * so they are one component and not two. Six copies of this file would be six
 * chances for one chart to answer the same question differently.
 *
 * THE AXIS RUNS THE FULL 0-5★ AND THE BARS START AT ZERO. Every year lands
 * between three and four and a half stars, so most of the plot is bar and the
 * differences sit in the top fifth of it. That is the honest picture: the gap
 * between the best year and the worst really is about one star out of five, and
 * cropping the axis to the occupied band would inflate it into a mountain range.
 *
 * NO LABEL ON THE BAR, unlike the other bar charts here. A hundred and five years
 * fit in the column at about six pixels each; there is no room for a number on a
 * bar and no reader who wants a hundred and five of them. The hover readout
 * carries the value instead.
 */
export function ReleaseYearBars({ data, stat }: { data: Dataset; stat: Stat }) {
  const { tokens } = useTheme();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<number | null>(null);

  const bars = useMemo(() => releaseYearBars(data, stat), [data, stat]);

  const H = 190;
  const MB = 26;
  const MR = 12;
  // The gutter carries the star ticks AND the reference line's label, so it sizes
  // to the longer of the two. Inside the plot at the right edge that label landed
  // squarely on the 2020s bars, which are the tallest run on the chart and the
  // least available space on it.
  const ML = 68;

  const live = bars.filter((b) => b.stars != null);
  const reference = overallFilmMean(data);
  if (!live.length || reference == null) return null;

  const plotW = W - ML - MR;
  const colW = plotW / Math.max(bars.length, 1);
  // A 2px surface gap between neighbours is the house spacer, but at six pixels a
  // column it would eat a third of the mark, so it yields to a quarter of the
  // column on a dense axis and only reaches 2px once there is room.
  const barW = Math.max(colW - Math.min(colW * 0.25, 2), 1);

  const y = (stars: number) => H - MB - (stars / 5) * (H - MB - 12);
  const cx = (i: number) => ML + (i + 0.5) * colW;
  const shown = hover != null ? bars[hover] : null;

  return (
    <div ref={ref}>
      {/* The readout replaces the per-bar labels the other charts print. Its own
          row, so hovering never reflows the chart under the cursor. */}
      <div
        className="mb-1 font-mono text-[10px] tracking-wider uppercase"
        style={{ color: tokens.ink.muted }}
      >
        {shown?.stars != null ? (
          <>
            <span style={{ color: tokens.ink.primary }}>{shown.year}</span> · {shown.n} film
            {shown.n === 1 ? "" : "s"} ·{" "}
            <span style={{ color: tokens.ink.primary }}>{shown.stars.toFixed(2)}★</span>
          </>
        ) : shown ? (
          <>
            <span style={{ color: tokens.ink.primary }}>{shown.year}</span> · nothing rated
          </>
        ) : (
          `${stat} rating`
        )}
      </div>

      <svg
        width={W}
        height={H}
        role="img"
        style={{ maxWidth: "100%" }}
        aria-label={`The ${stat} of my ratings for the films of each release year, ${
          bars[0].year
        } to ${bars[bars.length - 1].year}, on a five star axis.`}
      >
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <g key={`t-${s}`}>
            <line
              x1={ML}
              y1={y(s)}
              x2={W - MR}
              y2={y(s)}
              stroke={hairline(tokens.ink.grid, 45)}
            />
            {/* The gridline always draws; its LABEL yields to the reference's,
                which shares the gutter and is the one a reader came for. At about
                30px per star the two only meet when my average film lands within a
                fifth of a star of a whole one. */}
            {Math.abs(y(s) - y(reference)) > 9 && (
              <text
                x={ML - 6}
                y={y(s) + 3}
                textAnchor="end"
                fontSize={9}
                fill={tokens.ink.muted}
              >
                {s}★
              </text>
            )}
          </g>
        ))}

        {bars.map((b, i) => (
          <g key={b.year}>
            {b.stars != null && (
              <rect
                x={cx(i) - barW / 2}
                y={y(b.stars)}
                width={barW}
                height={H - MB - y(b.stars)}
                fill={hover === i ? tokens.accent : tokens.ink.mark}
                // Opacity means low evidence and nothing else; the hover is a
                // colour change so the two channels never collide.
                fillOpacity={b.n < THIN_N ? THIN_OPACITY : 1}
              />
            )}
            {/* Full-height hit area: a six-pixel column is a small target already,
                and a short bar would be a smaller one. */}
            <rect
              x={cx(i) - colW / 2}
              y={0}
              width={colW}
              height={H - MB}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        {/* My average FILM, not my average year. A year's bar clearing this line
            beat the library, which is the comparison the chart is for. */}
        <line
          x1={ML}
          y1={y(reference)}
          x2={W - MR}
          y2={y(reference)}
          stroke={tokens.ink.muted}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
        <text
          x={ML - 6}
          y={y(reference) + 3}
          textAnchor="end"
          fontSize={8}
          fill={tokens.ink.muted}
          pointerEvents="none"
        >
          mean {reference.toFixed(2)}★
        </text>

        {/* Decade marks only. Every year labelled would be a hundred and five
            overlapping numbers; the decade is the grain a reader navigates by. */}
        {bars.map((b, i) =>
          b.year % 10 === 0 ? (
            <text
              key={`lbl-${b.year}`}
              x={cx(i)}
              y={H - MB + 14}
              textAnchor="middle"
              fontSize={9}
              fill={tokens.ink.muted}
              pointerEvents="none"
            >
              {b.year}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
