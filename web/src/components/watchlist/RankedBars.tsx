"use client";

import { useState } from "react";
import { ACCENT, INK } from "@/lib/palette";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import type { RankedBar } from "@/lib/watchlistChart";

const LABEL_W = 150;
const BAR_W = 400;
const VALUE_W = 44;
const WIDTH = LABEL_W + BAR_W + VALUE_W;

/**
 * Ranked horizontal bars, one row per category, longest first.
 *
 * The one bar shape behind every watchlist breakdown — genre, keyword, language,
 * country. Four charts drawn by one component rather than four near-copies, so
 * the row height, label gutter and value placement cannot drift apart between
 * them the way they would if each chart owned its own geometry.
 *
 * Counts, not shares. A watchlist film carries several genres and several
 * keywords, so the bars sum past the film count and a percentage would be a
 * share of a total that means nothing. The caller's takeaway line says which.
 */
export function RankedBars({
  bars,
  total,
  active,
  onPick,
  ariaLabel,
}: {
  bars: RankedBar[];
  /** Films in the current view, for the hover readout's denominator. */
  total: number;
  /** Key currently driving the rail, drawn in the accent. */
  active?: string | null;
  /**
   * Cross-filter handler. Omitted for the charts whose category has no matching
   * rail control (genre beyond the tracked five, and keywords, which the rail
   * cannot express at all) — a bar that looks clickable and does nothing is
   * worse than one that never invited the click.
   */
  onPick?: (key: string) => void;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

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

  const peak = Math.max(...bars.map((b) => b.count));
  const HEIGHT = bars.length * (BAR_H + GAP) + 16;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        {bars.map((bar, i) => {
          const y = 8 + i * (BAR_H + GAP);
          const barLen = (bar.count / peak) * BAR_W;
          const isActive = active === bar.key;
          const isHover = hover === bar.key;
          // The count rides inside its own bar when the bar is long enough to
          // hold it, and steps outside when it is not — the same flip every
          // other bar chart here uses, so a short bar never hides its number.
          const inside = barLen > 30;

          return (
            <g key={bar.key}>
              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={isActive ? ACCENT : INK.secondary}
                fontSize={12}
                fontWeight={isActive ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {bar.label}
              </text>

              <rect
                x={LABEL_W}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={isActive ? ACCENT : bar.color}
                fillOpacity={isActive || isHover ? 0.95 : 0.72}
              />

              <text
                x={inside ? LABEL_W + barLen - 8 : LABEL_W + barLen + 8}
                y={y + BAR_H / 2}
                fill={valueLabelFill(inside)}
                fontSize={11}
                fontWeight={700}
                textAnchor={inside ? "end" : "start"}
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {bar.count}
              </text>

              {/* Full-row hit area: the reader is aiming at the row, not at the
                  ink, and the shortest bars are the hardest to hit. */}
              <rect
                x={0}
                y={y}
                width={WIDTH}
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
          half-second delay, which matches nothing else on the page. */}
      <p className="mt-1 h-4 text-xs text-[#67655f]">
        {hover
          ? (() => {
              const b = bars.find((x) => x.key === hover);
              if (!b) return "";
              const pct = total > 0 ? Math.round((100 * b.count) / total) : 0;
              return `${b.label}: ${b.count} of ${total} films (${pct}%)`;
            })()
          : ""}
      </p>
    </figure>
  );
}
