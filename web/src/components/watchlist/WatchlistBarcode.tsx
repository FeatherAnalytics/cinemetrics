"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, GENRE_KEYS, INK, primaryGenre } from "@/lib/palette";
import { useWidth } from "@/lib/useWidth";
import { ChartTakeaway } from "../ChartTakeaway";
import type { WatchlistFilm } from "@/lib/types";

const W0 = 720;
const W_MIN = 300;
const H = 120;
const AXIS_H = 22;

/**
 * Release position as a fractional year, so films inside one year separate.
 *
 * `released` is the full TMDB release date; `year` is the fallback for the
 * handful of films TMDB has no date for. A film with only a year lands on
 * January 1 of it, which is the honest place for "sometime in 1978" — it is not
 * pretending to a precision it does not have, it is just the year's own start.
 */
function position(f: WatchlistFilm): number | null {
  if (f.released) {
    const d = new Date(f.released + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const start = Date.UTC(y, 0, 1);
      const end = Date.UTC(y + 1, 0, 1);
      return y + (d.getTime() - start) / (end - start);
    }
  }
  return f.year ?? null;
}

/**
 * The watchlist as a barcode: one stripe per film, placed by release date.
 *
 * The main page's barcode is one stripe per watch in log order, so its x axis is
 * a sequence. This one is a real time axis — position is the release date, so
 * stripes bunch where the list clusters and leave white space over the years it
 * skips. That is the point of drawing it beside the decade chart, which rounds
 * these same films into ten-year bins and hides both the bunching inside a
 * decade and exactly where the gaps fall.
 *
 * Every film gets its own stripe. An earlier version let stripes overlap, which
 * lost films behind each other AND — because they were drawn semi-transparent —
 * made an overlap composite into a darker shade of its own genre colour, so the
 * chart appeared to use two blues for one genre. Stripes now DODGE: a film that
 * would land on an occupied slot is nudged right to the next free one, and
 * everything is drawn at full opacity. With 136 films across ~700px there is
 * room for all of them, so the nudge is under a pixel in all but the densest
 * runs, and no film is hidden or recoloured.
 */
export function WatchlistBarcode() {
  const { filteredWatchlist } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<number | null>(null);

  const films = useMemo(
    () =>
      filteredWatchlist
        .map((f) => ({ f, pos: position(f) }))
        .filter((e): e is { f: WatchlistFilm; pos: number } => e.pos != null)
        .sort((a, b) => a.pos - b.pos),
    [filteredWatchlist],
  );

  const ML = 8;
  const MR = 8;
  const plotW = Math.max(W - ML - MR, 1);
  const plotH = H - AXIS_H;

  // Laid out before the early return so the hook order never changes. Returns
  // the axis transform alongside the stripes: the squeeze below applies to both,
  // or the decade ticks would sit at positions the stripes no longer use.
  const { laid, tickX } = useMemo(() => {
    if (films.length === 0) return { laid: [], tickX: () => ML };
    const lo = films[0].pos;
    const hi = films[films.length - 1].pos;
    const span = hi - lo;
    const scale = (p: number) => (span === 0 ? plotW / 2 : ((p - lo) / span) * plotW);
    // Pitch is the width one film occupies, and it is never wider than an even
    // share of the plot. That is what makes the dodge below safe: even if every
    // film wanted the same instant, n slots at this pitch still fit, so nothing
    // has to be clamped at the right edge — clamping was what left stripes piled
    // on top of each other after the first attempt.
    const pitch = Math.min(6, plotW / films.length);
    const w = Math.max(pitch - 1, 1);
    let cursor = -Infinity;
    const placed = films.map(({ f, pos }) => {
      // Forward dodge: the wanted spot, or the next free one to its right.
      const x = Math.max(scale(pos), cursor + pitch);
      cursor = x;
      return { f, pos, x };
    });

    // A dense cluster near the right end pushes the dodge past the plot — the
    // 2020s alone hold 30 of these films. Squeeze the finished layout back in
    // rather than clamping, which would stack the overflow on the last pixel.
    // Positions and widths scale together, so the gaps survive and no two
    // stripes touch.
    const overflow = cursor + w > plotW ? plotW / (cursor + w) : 1;
    return {
      laid: placed.map((p) => ({ ...p, x: ML + p.x * overflow, w: w * overflow })),
      tickX: (year: number) => ML + scale(year) * overflow,
    };
  }, [films, plotW]);

  if (films.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No films match the current filters.
      </div>
    );
  }

  const lo = films[0].pos;
  const hi = films[films.length - 1].pos;

  // Decade ticks inside the range, so the axis reads as time rather than two end
  // labels with nothing between them.
  const ticks: number[] = [];
  for (let d = Math.ceil(lo / 10) * 10; d <= hi; d += 10) ticks.push(d);
  const tickEvery = plotW / Math.max(ticks.length, 1) < 34 ? 2 : 1;

  const hovered = hover != null ? laid[hover] : null;
  const genresPresent = GENRE_KEYS.filter((g) =>
    films.some(({ f }) => primaryGenre(f) === g),
  );
  const dated = films.filter(({ f }) => f.released).length;

  return (
    <figure className="m-0">
      <div ref={ref}>
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="Watchlist films as stripes along a release-date axis, colored by genre"
        >
          {ticks.map((d, i) =>
            i % tickEvery === 0 ? (
              <g key={d}>
                <line x1={tickX(d)} y1={0} x2={tickX(d)} y2={plotH} stroke="#eee" />
                <text x={tickX(d)} y={plotH + 14} textAnchor="middle" fontSize={9} fill={INK.muted}>
                  {d}
                </text>
              </g>
            ) : null,
          )}

          {laid.map(({ f, x, w }, i) => (
            <rect
              key={`${f.tmdb_id}-${i}`}
              x={x - w / 2}
              y={0}
              width={w}
              height={plotH}
              fill={GENRE_COLORS[primaryGenre(f)]}
              // Full opacity, always. Semi-transparent stripes composite where
              // they touch, which invents shades the genre scale does not have.
              opacity={hover == null || hover === i ? 1 : 0.25}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>

      {/* Genre key, listing only the genres actually on screen so it never
          explains a colour the chart is not using. */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {genresPresent.map((g) => (
          <span key={g} className="flex items-center gap-1 text-[10px] text-[#67655f]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: GENRE_COLORS[g] }}
            />
            {g}
          </span>
        ))}
      </div>

      {/* Readout in its own strip, like every other chart here. Fixed height so
          the page does not jump as the reader sweeps across the stripes. */}
      <p className="mt-1 h-4 text-xs text-[#67655f]">
        {hovered
          ? `${hovered.f.title}${hovered.f.released ? ` · ${hovered.f.released}` : ` · ${hovered.f.year}`} · ${primaryGenre(hovered.f)}`
          : ""}
      </p>
      <ChartTakeaway>
        {films.length} film{films.length === 1 ? "" : "s"} from {Math.floor(lo)} to{" "}
        {Math.floor(hi)}
        {dated < films.length && ` · ${films.length - dated} dated by year only`}
      </ChartTakeaway>
    </figure>
  );
}
