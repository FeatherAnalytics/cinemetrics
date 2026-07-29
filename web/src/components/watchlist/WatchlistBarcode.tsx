"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, GENRE_ORDER, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { useWidth } from "@/lib/useWidth";
import { ChartTakeaway } from "../ChartTakeaway";
import type { WatchlistFilm } from "@/lib/types";

const W0 = 720;
const W_MIN = 300;
const H = 132;
const AXIS_H = 20;
// Stacking order within a year, so a genre always sits at the same depth and the
// bands read horizontally across the chart instead of reshuffling per column.
const STACK_ORDER = [...GENRE_ORDER, "Other"] as GenreKey[];

/**
 * The watchlist by release year and genre: one equal-width column per year, one
 * brick per film, stacked.
 *
 * This replaced a true time axis, where each film sat at its exact release date.
 * That was honest about spacing and wrong about everything else: 30 films from
 * the 2020s had to share the six pixels their six years were worth, so they were
 * nudged sideways until the run spilled past the plot and the recent end of the
 * chart looked stretched relative to the sparse decades before it. The distortion
 * was an artefact of the layout, not a fact about the watchlist.
 *
 * Every year now gets the same width whether it holds seven films or none, so
 * column HEIGHT is a clean count and the eye can compare 1974 with 2024 directly.
 * Empty years stay in as blank columns — the axis is time, and closing the gaps
 * would put 1931 against 1948 and invent a continuity the list does not have.
 *
 * Colour is genre on the site's five-slot scale, so a red band here means what it
 * means everywhere else.
 */
export function WatchlistBarcode() {
  const { filteredWatchlist, selectedId, setSelected } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<WatchlistFilm | null>(null);

  const { years, byYear, peak } = useMemo(() => {
    const dated = filteredWatchlist.filter((f) => f.year != null);
    // Annotated so the empty case does not widen byYear to Map<any, any> and
    // silently un-type every callback that reads it below.
    const empty = {
      years: [] as number[],
      byYear: new Map<number, WatchlistFilm[]>(),
      peak: 0,
    };
    if (dated.length === 0) return empty;
    const ys = dated.map((f) => f.year as number);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);

    const byYear = new Map<number, WatchlistFilm[]>();
    for (const f of dated) {
      const y = f.year as number;
      const list = byYear.get(y);
      if (list) list.push(f);
      else byYear.set(y, [f]);
    }
    // Sort each column by the shared stack order, then by title so a year's
    // bricks do not swap places between renders.
    for (const list of byYear.values()) {
      list.sort(
        (a, b) =>
          STACK_ORDER.indexOf(primaryGenre(a)) - STACK_ORDER.indexOf(primaryGenre(b)) ||
          a.title.localeCompare(b.title),
      );
    }

    const years: number[] = [];
    for (let y = lo; y <= hi; y++) years.push(y);
    const peak = Math.max(...[...byYear.values()].map((l) => l.length));
    return { years, byYear, peak };
  }, [filteredWatchlist]);

  if (years.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No films match the current filters.
      </div>
    );
  }

  const ML = 8;
  const MR = 8;
  const plotW = Math.max(W - ML - MR, 1);
  const plotH = H - AXIS_H;
  const colW = plotW / years.length;
  // A hairline gap between columns, but only once the columns are wide enough to
  // spare it; below that the gap would eat the brick.
  const brickW = colW > 3 ? Math.max(colW - 1, 1) : colW;
  const brickH = plotH / peak;
  const x = (i: number) => ML + i * colW;

  // Decade ticks land on the column of the year they name, which is exact now
  // that the axis is ordinal.
  const ticks = years
    .map((y, i) => ({ y, i }))
    .filter(({ y }) => y % 10 === 0);
  const tickEvery = (plotW / Math.max(ticks.length, 1)) < 34 ? 2 : 1;

  return (
    <figure className="m-0">
      <div ref={ref}>
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Watchlist films by release year, one column per year, stacked and colored by genre"
        >
          {ticks.map(({ y, i }, n) =>
            n % tickEvery === 0 ? (
              <text
                key={y}
                x={x(i) + colW / 2}
                y={plotH + 14}
                textAnchor="middle"
                fontSize={9}
                fill={INK.muted}
              >
                {y}
              </text>
            ) : null,
          )}

          {years.map((y, i) => {
            const films = byYear.get(y) ?? [];
            return films.map((f, k) => {
              const isHover = hover === f;
              const isPicked = selectedId === f.tmdb_id;
              return (
                <rect
                  key={`${f.tmdb_id}-${k}`}
                  x={x(i)}
                  // Stacked upward from the baseline, so a tall column reads as
                  // "more films that year" rather than as a bar hanging down.
                  y={plotH - (k + 1) * brickH}
                  width={brickW}
                  height={Math.max(brickH - 0.5, 1)}
                  fill={GENRE_COLORS[primaryGenre(f)]}
                  // Full opacity throughout: semi-transparent marks composite
                  // where they meet and invent shades the genre scale lacks.
                  opacity={hover == null || isHover || isPicked ? 1 : 0.25}
                  stroke={isPicked ? INK.primary : "none"}
                  strokeWidth={isPicked ? 1 : 0}
                  style={{ cursor: "pointer" }}
                  onMouseOver={() => setHover(f)}
                  onMouseOut={() => setHover(null)}
                  // Clicking a brick opens that film in the table below. Toggles,
                  // so clicking it again returns the table to the whole list.
                  onClick={() => setSelected(f.tmdb_id)}
                />
              );
            });
          })}

          <line x1={ML} y1={plotH} x2={ML + plotW} y2={plotH} stroke={INK.grid} strokeWidth={0.75} />
        </svg>
      </div>

      {/* Genre key, listing only what is on screen so it never explains a colour
          the chart is not using. */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {STACK_ORDER.filter((g) =>
          [...byYear.values()].some((list) => list.some((f) => primaryGenre(f) === g)),
        ).map((g) => (
          <span key={g} className="flex items-center gap-1 text-[10px] text-[#67655f]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: GENRE_COLORS[g] }}
            />
            {g}
          </span>
        ))}
      </div>

      {/* Readout in its own strip, fixed height so the page does not jump. */}
      <p className="mt-1 h-4 text-xs text-[#67655f]">
        {hover
          ? `${hover.title} (${hover.year}) · ${primaryGenre(hover)}${
              hover.released ? ` · released ${hover.released}` : ""
            }`
          : ""}
      </p>
      <ChartTakeaway>
        one column per year, {years[0]}–{years[years.length - 1]} · click a film to open it
      </ChartTakeaway>
    </figure>
  );
}
