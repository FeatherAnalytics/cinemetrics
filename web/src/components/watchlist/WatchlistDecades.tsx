"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import { valueLabelFill } from "@/lib/barChart";
import { useWidth } from "@/lib/useWidth";
import { decadeBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";

const W0 = 720;
const W_MIN = 300;
const FADE = "#b3b1a6";

/**
 * When the watchlist's films were released.
 *
 * A histogram over time, so empty decades stay in as zero-height columns. Drop
 * them and a sparse early run closes up, putting the 1910s next to the 1950s and
 * showing a continuous interest that was never there.
 *
 * No median line, unlike the stats-page bar charts: the x axis here is time
 * rather than a set of interchangeable categories, and the median of a time axis
 * is a date, which says nothing about how many films sit in any decade.
 *
 * Clicking a column narrows the release-year rail to that decade.
 */
export function WatchlistDecades() {
  const { filteredWatchlist, filters, setReleaseYearRange, watchlistOptions } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<number | null>(null);

  const bars = useMemo(() => decadeBars(filteredWatchlist), [filteredWatchlist]);

  if (bars.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No films match the current filters.
      </div>
    );
  }

  const H = 190;
  const ML = 30;
  const MR = 12;
  const MB = 28;
  const peak = Math.max(...bars.map((b) => b.count), 1);
  const plotW = W - ML - MR;
  const colW = plotW / bars.length;
  const barW = Math.min(colW - 6, 44);
  const y = (v: number) => H - MB - (v / peak) * (H - MB - 18);
  const cx = (i: number) => ML + (i + 0.5) * colW;

  // Decade labels are full years ("1910s", not "10s"), because the list spans
  // both the 1910s and the 2010s. Five characters need ~26px, so on a narrow
  // column they would overlap; there, label every other decade rather than
  // shrinking the type below the rest of the page's floor. The bars themselves
  // are untouched — only the labels thin out.
  const labelEvery = colW < 30 ? 2 : 1;

  // A decade is "active" when the rail is narrowed to exactly its ten years,
  // which is what clicking a column sets. A hand-dragged range that merely
  // overlaps does not light a column up, because it does not correspond to one.
  const activeDecade =
    filters.releaseYearRange &&
    filters.releaseYearRange[1] - filters.releaseYearRange[0] === 9 &&
    filters.releaseYearRange[0] % 10 === 0
      ? filters.releaseYearRange[0]
      : null;

  const pick = (decade: number) => {
    if (activeDecade === decade) setReleaseYearRange(watchlistOptions.releaseYearBounds);
    else setReleaseYearRange([decade, decade + 9]);
  };

  return (
    <figure className="m-0">
      <div ref={ref}>
        <svg width={W} height={H} role="img" aria-label="Watchlist films per release decade">
          {[0, peak].map((v, i) => (
            <g key={`t-${i}`}>
              <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke="#eee" />
              <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
                {v}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            const isActive = activeDecade === b.decade;
            const barH = H - MB - y(b.count);
            const inside = barH > 22;
            return (
              <g key={b.decade}>
                <rect
                  x={cx(i) - barW / 2}
                  y={y(b.count)}
                  width={barW}
                  height={barH}
                  fill={isActive ? ACCENT : FADE}
                  fillOpacity={hover === b.decade ? 0.95 : 1}
                />
                {/* An empty decade gets no label: there is no bar to annotate and
                    nothing happened to describe. */}
                {b.count > 0 && (
                  <text
                    x={cx(i)}
                    y={inside ? y(b.count) + 15 : y(b.count) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={valueLabelFill(inside)}
                    pointerEvents="none"
                  >
                    {b.count}
                  </text>
                )}
                <rect
                  x={cx(i) - colW / 2}
                  y={0}
                  width={colW}
                  height={H - MB}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => pick(b.decade)}
                  onMouseEnter={() => setHover(b.decade)}
                  onMouseLeave={() => setHover(null)}
                />
                {/* An active decade always keeps its label, whatever the
                    thinning would otherwise do: it is the one the reader just
                    clicked, and losing its name is losing the feedback. */}
                {(i % labelEvery === 0 || isActive) && (
                  <text
                    x={cx(i)}
                    y={H - MB + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill={isActive ? ACCENT : INK.primary}
                    fontWeight={isActive ? 700 : 400}
                    pointerEvents="none"
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* A single surviving decade reads as "1910s to 1910s" if the range is
          printed unconditionally, so a one-decade view states the decade and
          offers the way back out instead. */}
      <ChartTakeaway>
        {bars.length > 1
          ? `${bars[0].decade}s to ${bars[bars.length - 1].decade}s`
          : `${bars[0].decade}s only`}
      </ChartTakeaway>
    </figure>
  );
}
