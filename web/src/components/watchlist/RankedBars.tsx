"use client";

import { useState } from "react";
import { useTheme } from "@/lib/theme";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { deltaLabel, type RatingDelta } from "@/lib/ratingDelta";
import type { RankedBar } from "@/lib/watchlistChart";

const LABEL_W = 150;
const BAR_W = 300; // films track, grows left to right
const DEV_W = 200; // deviation track, signed, growing both ways from its own zero
const WIDTH = LABEL_W + BAR_W + DEV_W;
const DEV_ZERO = LABEL_W + BAR_W + DEV_W / 2;
// Half the track, less room for a value label outside the longest bar either way.
const DEV_HALF = DEV_W / 2 - 22;
// Below this length a value label will not fit inside its bar and sits outside.
const INSIDE_MIN = 34;

/**
 * Ranked horizontal bars, one row per category, longest first.
 *
 * The one bar shape behind every watchlist breakdown — genre, keyword, language,
 * country. Four charts drawn by one component rather than four near-copies, so
 * row height, label gutter and value placement cannot drift apart between them.
 *
 * Counts, not shares. A watchlist film carries several genres and several
 * keywords, so the bars sum past the film count and a percentage would be a
 * share of a total that means nothing. The caller's takeaway says which.
 *
 * The optional second track is a RATING deviation, and it describes different
 * films from the ones the first track counts — deliberately. Nothing on the
 * watchlist has been rated, so the only honest reading is "how I have rated the
 * films I ALREADY SAW that share this tag". The column header says so, because
 * two tracks on one row otherwise read as two measurements of one set.
 */
export function RankedBars({
  bars,
  total,
  active,
  onPick,
  ariaLabel,
  deltas,
  deltaHeader = "MY RATING vs AVERAGE",
}: {
  bars: RankedBar[];
  /** Films in the current view, for the hover readout's denominator. */
  total: number;
  /** Key currently driving the rail, marked with the selection outline. */
  active?: string | null;
  /**
   * Cross-filter handler. Omitted for charts whose category has no matching rail
   * control — a bar that looks clickable and does nothing is worse than one that
   * never invited the click.
   */
  onPick?: (key: string) => void;
  ariaLabel: string;
  /**
   * Rating deviation per key, from films already watched. Omit entirely and the
   * chart is a single track at its natural width.
   */
  deltas?: Map<string, RatingDelta>;
  deltaHeader?: string;
}) {
  const { tokens } = useTheme();
  const [hover, setHover] = useState<string | null>(null);

  if (bars.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm"
        style={{
          color: tokens.ink.muted,
          borderColor: `color-mix(in srgb, ${tokens.ink.primary} 15%, transparent)`,
        }}
      >
        No films match the current filters.
      </div>
    );
  }

  const hasDev = deltas != null && bars.some((b) => deltas.has(b.key));
  const width = hasDev ? WIDTH : LABEL_W + BAR_W + 40;
  const peak = Math.max(...bars.map((b) => b.count));
  // Scaled against its own maximum, so the longest deviation fills the track.
  const devMax = Math.max(
    1,
    ...bars.map((b) => Math.abs(deltas?.get(b.key)?.delta ?? 0)),
  );
  const HEIGHT = bars.length * (BAR_H + GAP) + (hasDev ? 28 : 16);
  const top = hasDev ? 20 : 8;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        {hasDev && (
          <>
            <text
              x={LABEL_W}
              y={8}
              fill={tokens.ink.muted}
              fontSize={9}
              letterSpacing="0.1em"
              fontFamily="var(--font-mono)"
            >
              FILMS IN WATCHLIST
            </text>
            <text
              x={DEV_ZERO}
              y={8}
              fill={tokens.ink.muted}
              fontSize={9}
              letterSpacing="0.1em"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
            >
              {deltaHeader}
            </text>
            <line
              x1={DEV_ZERO}
              y1={top}
              x2={DEV_ZERO}
              y2={HEIGHT - 8}
              stroke={tokens.ink.axis}
              strokeWidth={1.5}
            />
          </>
        )}

        {bars.map((bar, i) => {
          const y = top + i * (BAR_H + GAP);
          const barLen = (bar.count / peak) * BAR_W;
          const isActive = active === bar.key;
          const isHover = hover === bar.key;
          // The count rides inside its own bar when the bar is long enough to
          // hold it, and steps outside when it is not — the same flip every other
          // bar chart here uses, so a short bar never hides its number.
          const inside = barLen > INSIDE_MIN;
          const d = deltas?.get(bar.key) ?? null;
          const devLen = d == null ? 0 : (Math.abs(d.delta) / devMax) * DEV_HALF;
          const devInside = devLen > INSIDE_MIN;

          const dim = active != null && !isActive;

          return (
            <g key={bar.key} opacity={dim ? 0.35 : 1}>
              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={isActive ? tokens.ui.selected : tokens.ink.secondary}
                fontSize={12}
                fontWeight={isActive ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {bar.label}
              </text>

              {/* Selection is an OUTLINE, not a recolour. The fill is the bar's
                  genre, and repainting it crimson to say "picked" threw that away
                  — the reader lost the one thing the colour was carrying at the
                  exact moment they were focused on that row. Ink moves to
                  the stroke and the label instead, which is how CountryBars has
                  always marked its selection. */}
              <rect
                x={LABEL_W}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={bar.color}
                fillOpacity={isActive || isHover ? 0.95 : 0.72}
                stroke={isActive ? tokens.ui.selected : "none"}
                strokeWidth={isActive ? 1.75 : 0}
              />

              <text
                x={inside ? LABEL_W + barLen - 8 : LABEL_W + barLen + 8}
                y={y + BAR_H / 2}
                fill={valueLabelFill(inside, tokens.ink)}
                fontSize={11}
                fontWeight={700}
                textAnchor={inside ? "end" : "start"}
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {bar.count}
              </text>

              {/* The rating deviation, when enough watched films back it. Same
                  fill as the count bar so a row reads as one category in one
                  colour; DIRECTION carries the sign. A row with too few watched
                  films simply has no second bar — an absent mark is honest,
                  a zero-length one would read as "exactly at my average". */}
              {hasDev && d != null && (
                <>
                  <rect
                    x={d.delta > 0 ? DEV_ZERO : DEV_ZERO - devLen}
                    y={y}
                    width={devLen}
                    height={BAR_H}
                    fill={bar.color}
                    fillOpacity={isActive || isHover ? 0.95 : 0.72}
                    stroke={isActive ? tokens.ui.selected : "none"}
                    strokeWidth={isActive ? 1.75 : 0}
                  />
                  <text
                    x={
                      d.delta > 0
                        ? DEV_ZERO + devLen + (devInside ? -6 : 6)
                        : DEV_ZERO - devLen + (devInside ? 6 : -6)
                    }
                    y={y + BAR_H / 2}
                    fill={valueLabelFill(devInside, tokens.ink)}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={
                      d.delta > 0 ? (devInside ? "end" : "start") : devInside ? "start" : "end"
                    }
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    {deltaLabel(d.delta)}
                  </text>
                </>
              )}

              {/* Full-row hit area: the reader is aiming at the row, not at the
                  ink, and the shortest bars are the hardest to hit. */}
              <rect
                x={0}
                y={y}
                width={width}
                height={BAR_H}
                fill="transparent"
                style={{ cursor: onPick ? "pointer" : "default" }}
                onMouseEnter={() => setHover(bar.key)}
                onMouseLeave={() => setHover(null)}
                onClick={onPick ? () => onPick(bar.key) : undefined}
              />
            </g>
          );
        })}
      </svg>
      {/* The readout lives under the chart, in its own strip, rather than in an
          SVG <title>: the native tooltip is an OS box with its own font and
          half-second delay, matching nothing else on the page. */}
      <p className="mt-1 h-4 text-xs" style={{ color: tokens.ink.muted }}>
        {hover
          ? (() => {
              const b = bars.find((x) => x.key === hover);
              if (!b) return "";
              const pct = total > 0 ? Math.round((100 * b.count) / total) : 0;
              const d = deltas?.get(b.key);
              const devPart = d
                ? ` · ${deltaLabel(d.delta)} vs my average (n = ${d.n} film${
                    d.n === 1 ? "" : "s"
                  })`
                : "";
              // The bar's colour is its dominant genre, and nothing else on the
              // chart decodes it — a legend would repeat the five swatches the
              // rail already shows, so the readout names it instead.
              const genrePart = b.key === b.genre ? "" : ``;
              return `${b.label}: ${pct}% of the watchlist${genrePart}${devPart}`;
            })()
          : ""}
      </p>
    </figure>
  );
}
