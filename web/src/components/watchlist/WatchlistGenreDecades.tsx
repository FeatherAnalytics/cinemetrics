"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, type GenreKey } from "@/lib/palette";
import { insetRect, lerpHex, NO_DATA_STROKE } from "@/lib/statsChart";
import { useWidth } from "@/lib/useWidth";
import { cellKey, genreDecadeGrid } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";

const W0 = 720;
const W_MIN = 300;
const ROW_H = 26;
const LABEL_W = 78;
const AXIS_H = 20;

/**
 * Films per primary genre and release decade.
 *
 * The middle step between the two charts around it. The decade bars above bin
 * by ten years but discard genre; the barcode below keeps genre but places every
 * film at its own release date, so it has no bins to compare across. This grid
 * has both, in cells that are all the same size by construction.
 *
 * The thing only this chart can show is an ABSENCE. An empty cell is drawn — an
 * outlined blank — so "no 1930s horror on the list" is visible as a gap in a
 * row rather than as something the reader has to notice is missing. Stacked bars
 * hide that inside a column.
 *
 * One genre per film here, by the site's primaryGenre, NOT the every-genre count
 * the genre bar chart uses. A film sits in exactly one cell, so each column sums
 * to the decade count directly above it; letting films count twice would make
 * the two charts disagree about the same decade.
 *
 * Cells ramp from paper to the genre's own colour, so a row reads as one genre
 * at varying strength rather than as a second colour scale to learn.
 */
export function WatchlistGenreDecades() {
  const { filteredWatchlist } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<{ g: GenreKey; d: number } | null>(null);

  const grid = useMemo(() => genreDecadeGrid(filteredWatchlist), [filteredWatchlist]);

  if (grid.genres.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No films match the current filters.
      </div>
    );
  }

  const plotW = Math.max(W - LABEL_W - 8, 1);
  const colW = plotW / grid.decades.length;
  const H = grid.genres.length * ROW_H + AXIS_H;
  // Every other decade label once the columns get tight, the same thinning rule
  // the decade chart uses.
  const labelEvery = colW < 34 ? 2 : 1;

  const hoveredCount =
    hover != null ? (grid.cells.get(cellKey(hover.g, hover.d)) ?? 0) : null;

  return (
    <figure className="m-0">
      <div ref={ref}>
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Watchlist films per primary genre and release decade, darker cells holding more films"
        >
          {grid.genres.map((g, r) => (
            <g key={g}>
              <text
                x={LABEL_W - 8}
                y={r * ROW_H + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill={INK.secondary}
              >
                {g}
              </text>
              {grid.decades.map((d, c) => {
                const n = grid.cells.get(cellKey(g, d)) ?? 0;
                const x = LABEL_W + c * colW;
                const y = r * ROW_H;
                const isHover = hover?.g === g && hover?.d === d;
                // The ramp starts at the paper surface rather than white, so an
                // almost-empty cell recedes into the page instead of glowing.
                const t = grid.peak > 0 ? n / grid.peak : 0;
                const fill = lerpHex(INK.surface, GENRE_COLORS[g], 0.15 + 0.85 * t);
                const box = insetRect(x, y, colW, ROW_H);
                return n === 0 ? (
                  // Empty cell: outlined, not filled. Drawn INSIDE its bounds so
                  // the stroke does not make it read as a larger cell than its
                  // filled neighbours.
                  <rect
                    key={d}
                    {...box}
                    fill="none"
                    stroke={INK.grid}
                    strokeWidth={NO_DATA_STROKE}
                    onMouseOver={() => setHover({ g, d })}
                    onMouseOut={() => setHover(null)}
                  />
                ) : (
                  <g key={d}>
                    <rect
                      {...box}
                      fill={fill}
                      stroke={isHover ? INK.primary : "none"}
                      strokeWidth={isHover ? 1.5 : 0}
                      onMouseOver={() => setHover({ g, d })}
                      onMouseOut={() => setHover(null)}
                    />
                    {/* The count only prints where the cell is wide enough to
                        hold it; the colour carries it everywhere else. */}
                    {colW > 22 && (
                      <text
                        x={x + colW / 2}
                        y={y + ROW_H / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill={t > 0.55 ? INK.surface : INK.primary}
                        pointerEvents="none"
                      >
                        {n}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {grid.decades.map((d, c) =>
            c % labelEvery === 0 ? (
              <text
                key={d}
                x={LABEL_W + (c + 0.5) * colW}
                y={grid.genres.length * ROW_H + 14}
                textAnchor="middle"
                fontSize={9}
                fill={INK.muted}
              >
                {d}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {/* Readout in its own strip, matching every other chart here. */}
      <p className="mt-1 h-4 text-xs text-[#67655f]">
        {hover
          ? hoveredCount === 0
            ? `${hover.g}, ${hover.d}s: nothing waiting`
            : `${hover.g}, ${hover.d}s: ${hoveredCount} film${hoveredCount === 1 ? "" : "s"}`
          : ""}
      </p>
      <ChartTakeaway>
        one genre per film · darkest = {grid.peak}
      </ChartTakeaway>
    </figure>
  );
}
