"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, GENRE_KEYS, INK, primaryGenre } from "@/lib/palette";
import { useWidth } from "@/lib/useWidth";
import { ChartTakeaway } from "../ChartTakeaway";

const W0 = 720;
const W_MIN = 300;
const H = 120;
const AXIS_H = 22;
const STRIPE_MIN = 2;

/**
 * The watchlist as a barcode: one stripe per film, placed by RELEASE year.
 *
 * The main page's barcode is one stripe per watch in log order, so its x axis is
 * a sequence and every stripe is the same width. This one is a real time axis —
 * position is the release year, so stripes bunch where the list clusters and
 * leave white space over the years it skips. That is the whole point of drawing
 * it: the decade chart buckets those same films into ten-year bins, which hides
 * both the bunching inside a decade and where exactly the gaps fall.
 *
 * Colour is genre, on the same five-slot identity scale the rest of the site
 * uses, so a red band here means the same thing it means anywhere else.
 *
 * Stripes overlap rather than dodge. With 136 films over 110 years, a year with
 * four films draws four stripes in one place; the alternative — widening the
 * chart until every film has its own column — would make the axis no longer
 * time. Overlap is legible as density, which is what the chart is for.
 */
export function WatchlistBarcode() {
  const { filteredWatchlist } = useExplorer();
  const [ref, W] = useWidth(W0, W_MIN);
  const [hover, setHover] = useState<number | null>(null);

  const films = useMemo(
    () =>
      filteredWatchlist
        .filter((f) => f.year != null)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
    [filteredWatchlist],
  );

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

  const lo = films[0].year!;
  const hi = films[films.length - 1].year!;
  const ML = 8;
  const MR = 8;
  const plotW = W - ML - MR;
  // A single-year view would divide by zero; centre the stripes instead.
  const span = hi - lo;
  const x = (year: number) => (span === 0 ? ML + plotW / 2 : ML + ((year - lo) / span) * plotW);
  const stripeW = Math.max(STRIPE_MIN, Math.min(6, plotW / Math.max(films.length, 1)));
  const plotH = H - AXIS_H;

  // Decade ticks inside the range, so the axis reads as time rather than as two
  // end labels with nothing between them.
  const firstDecade = Math.ceil(lo / 10) * 10;
  const ticks: number[] = [];
  for (let d = firstDecade; d <= hi; d += 10) ticks.push(d);
  // On a narrow column, every other decade — the same thinning rule the decade
  // chart uses, for the same reason.
  const tickEvery = plotW / Math.max(ticks.length, 1) < 34 ? 2 : 1;

  const hovered = hover != null ? films[hover] : null;
  const genresPresent = GENRE_KEYS.filter((g) => films.some((f) => primaryGenre(f) === g));

  return (
    <figure className="m-0">
      <div ref={ref}>
        <svg width={W} height={H} role="img" aria-label="Watchlist films as stripes along a release-year axis, colored by genre">
          {ticks.map((d, i) =>
            i % tickEvery === 0 ? (
              <g key={d}>
                <line x1={x(d)} y1={0} x2={x(d)} y2={plotH} stroke="#eee" />
                <text
                  x={x(d)}
                  y={plotH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill={INK.muted}
                >
                  {d}
                </text>
              </g>
            ) : null,
          )}

          {films.map((f, i) => {
            const isHover = hover === i;
            return (
              <rect
                key={`${f.tmdb_id}-${i}`}
                x={x(f.year!) - stripeW / 2}
                y={0}
                width={stripeW}
                height={plotH}
                fill={GENRE_COLORS[primaryGenre(f)]}
                fillOpacity={hover == null ? 0.78 : isHover ? 1 : 0.28}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default" }}
              />
            );
          })}
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
        {hovered ? `${hovered.title} (${hovered.year}) · ${primaryGenre(hovered)}` : ""}
      </p>
      <ChartTakeaway>
        {films.length} film{films.length === 1 ? "" : "s"} from {lo} to {hi}
      </ChartTakeaway>
    </figure>
  );
}
