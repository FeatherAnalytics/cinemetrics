"use client";

import { ACCENT } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { valueLabelFill } from "@/lib/barChart";
import { insetRect, NO_DATA_STROKE } from "@/lib/statsChart";
import { useWidth } from "@/lib/useWidth";

const W0 = 720; // pre-measurement width, matching the usual desktop column
const W_MIN = 300;

export type RateBar = {
  label: string;
  /** Watches with the heart. */
  liked: number;
  /** Watches that RECORDED a heart state. Zero means nothing recorded one. */
  n: number;
};

/**
 * Below this many watches a column is drawn faded.
 *
 * A rate over one or two watches is 0% or 100% by arithmetic, and at full
 * strength it says the least in the loudest voice. Filtered to the Miyazaki
 * collection, one Comedy watch produced a 100% column beside a 47% column
 * standing on a hundred. Fading is the same 0.35 the horizontal bar charts use
 * for an unselected row, so it reads as "not the thing to look at" rather than
 * as a new encoding.
 *
 * Opacity means low evidence and nothing else. Selection is drawn as an outline
 * for that reason: dimming the other columns would put two meanings on one
 * channel, and a reader cannot tell a thin column from an unselected one.
 */
const THIN_N = 5;
const THIN_OPACITY = 0.35;

/**
 * A share per category, as 100% stacked columns: hearted from the baseline, the
 * rest above it.
 *
 * STACKED RATHER THAN A LONE BAR, because a lone bar cannot distinguish "0%" from
 * "nothing here". Both drew as absence, so the only mark left was a floating
 * number, and the first reader to meet it read that number as the value: at 1
 * star the rate is 0% and the "2" beside the empty space became "I liked 2 films
 * I rated 1 star". It means two watches were rated 1 star and neither was
 * hearted. A full-height column says that: the evidence exists, none of it is
 * crimson.
 *
 * It also makes the complement visible. The question is a split, and half of a
 * split drawn as white space is the half a reader forgets to count.
 *
 * Hearted sits on the BOTTOM so every column measures its share from the same
 * edge. Stacked the other way each boundary would start from a different height
 * and the comparison the chart exists for would be gone.
 *
 * Geometry, type sizes, the full-height hit area and the inside/outside label
 * flip are lifted from `stats/CategoryBars`. What differs is the SCALE, and that
 * difference is why this is a second component rather than a flag on the first:
 *
 * - The axis is pinned to 0-100%, not scaled to the peak. A rate is already a
 *   proportion of a known whole, so peak-scaling would make every panel's
 *   columns mean a different thing.
 * - The reference line is a fixed, meaningful level rather than the median of the
 *   categories. The median of five bands is a property of how the bands were cut.
 *
 * THE DENOMINATOR STAYS IN ITS OWN ROW. Every column is now full height, so the
 * geometry says nothing about how much evidence is under it, and 100% of two
 * watches and 73% of two hundred are not the same claim. The row is captioned in
 * the axis gutter, because an uncaptioned row of numbers under a chart is the
 * ambiguity this component exists to remove.
 */
export function RateBars({
  bars,
  active,
  onPick,
  accent = ACCENT,
  refAt = 0.5,
  refLabel = "coin flip",
  caption,
}: {
  bars: RateBar[];
  /** Index currently driving the selection, drawn outlined. */
  active?: number | null;
  onPick?: (index: number) => void;
  /** Color of the hearted segment, so a genre filter recolors the chart. */
  accent?: string;
  /**
   * Where the reference line sits, 0..1. Travels with `refLabel` as a pair: the
   * line and the words naming it have to be the same number, or the chart is
   * captioned with a level it does not draw.
   */
  refAt?: number;
  refLabel?: string;
  /** Left side of the header row. The legend takes the right. */
  caption?: string;
}) {
  const { tokens } = useTheme();
  // Chrome gray for the complement. Never a genre color, so "not hearted" cannot
  // read as a category, and never named "other": that word is a genre here.
  const REST = tokens.ink.grid;
  const NO_DATA = tokens.surface.well;
  const [ref, W] = useWidth(W0, W_MIN);
  // MB carries two rows: the category label, then the count row under it.
  const H = 196;
  const ML = 40;
  const MB = 46;
  // The reference label gets its own margin rather than floating over the plot.
  // Parked inside, it landed on the last column as soon as that column reached
  // its height. Reserving the room means the line can end before the words start
  // and neither has to move.
  const MR = 12 + (refLabel ? refLabel.length * 4.7 + 8 : 0);

  const plotW = W - ML - MR;
  const colW = plotW / Math.max(bars.length, 1);
  const barW = Math.min(colW - 10, 46);

  const y = (v: number) => H - MB - v * (H - MB - 14);
  const cx = (i: number) => ML + (i + 0.5) * colW;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rateOf = (b: RateBar) => (b.n > 0 ? b.liked / b.n : 0);

  return (
    <div ref={ref}>
      {(caption || bars.length > 0) && (
        <div
          className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider"
          style={{ color: tokens.ink.muted }}
        >
          {caption && <span>{caption}</span>}
          {/* Two segments need naming. In the header rather than beside the
              plot, so it cannot be mistaken for an axis. */}
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <svg width={8} height={8} aria-hidden>
                <rect width={8} height={8} fill={accent} />
              </svg>
              hearted
            </span>
            <span className="flex items-center gap-1">
              <svg width={8} height={8} aria-hidden>
                <rect width={8} height={8} fill={REST} />
              </svg>
              not
            </span>
          </span>
        </div>
      )}
      <svg width={W} height={H} role="img" style={{ maxWidth: "100%" }}>
        {[0, 0.5, 1].map((v) => (
          <g key={`t-${v}`}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={tokens.ink.grid} strokeOpacity={0.4} />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={tokens.ink.muted}>
              {pct(v)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const rate = rateOf(b);
          const thin = b.n > 0 && b.n < THIN_N;
          const likedH = H - MB - y(rate);
          // A faded segment never takes the inside label: surface-white type on a
          // 35% fill is not readable against the paper behind it.
          const inside = likedH > 24 && !thin;
          return (
            <g key={`bar-${i}`} fillOpacity={thin ? THIN_OPACITY : 1}>
              {b.n === 0 ? (
                /* Nothing recorded a heart here. The house no-data treatment:
                   the pale tint plus an ink outline, inset so the stroke does
                   not make the column measure wider than its neighbors. Drawn
                   on all four edges because the 10px gutter means every edge
                   meets empty space; the per-edge rule only bites where columns
                   butt together. */
                <rect
                  {...insetRect(cx(i) - barW / 2, y(1), barW, H - MB - y(1))}
                  fill={NO_DATA}
                  stroke={tokens.ink.primary}
                  strokeWidth={NO_DATA_STROKE}
                />
              ) : (
                <>
                  <rect
                    x={cx(i) - barW / 2}
                    y={y(1)}
                    width={barW}
                    height={y(rate) - y(1)}
                    fill={REST}
                  />
                  <rect
                    x={cx(i) - barW / 2}
                    y={y(rate)}
                    width={barW}
                    height={likedH}
                    fill={accent}
                  />
                </>
              )}
              {/* Selection is an outline, not a fill change: the fills are
                  already carrying the split and opacity is already carrying
                  thin-n. */}
              {active === i && b.n > 0 && (
                <rect
                  x={cx(i) - barW / 2 - 1.5}
                  y={y(1) - 1.5}
                  width={barW + 3}
                  height={H - MB - y(1) + 3}
                  fill="none"
                  stroke={tokens.ink.primary}
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              )}
              <rect
                x={cx(i) - colW / 2}
                y={0}
                width={colW}
                height={H - MB}
                fill="transparent"
                style={{ cursor: onPick && b.n > 0 ? "pointer" : "default" }}
                onClick={onPick && b.n > 0 ? () => onPick(i) : undefined}
              />
              {b.n > 0 && (
                <text
                  x={cx(i)}
                  y={inside ? y(rate) + 15 : y(rate) - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={valueLabelFill(inside, tokens.ink)}
                  fillOpacity={1}
                  pointerEvents="none"
                >
                  {pct(rate)}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={ML}
          y1={y(refAt)}
          x2={W - MR}
          y2={y(refAt)}
          stroke={tokens.ink.muted}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
        <text
          x={W - MR + 6}
          y={y(refAt) + 3}
          textAnchor="start"
          fontSize={8}
          fill={tokens.ink.muted}
          pointerEvents="none"
        >
          {refLabel}
        </text>

        {bars.map((b, i) => (
          <text
            key={`lbl-${i}`}
            x={cx(i)}
            y={H - MB + 14}
            textAnchor="middle"
            fontSize={9}
            fill={active === i ? accent : tokens.ink.primary}
            fontWeight={active === i ? 700 : 400}
            pointerEvents="none"
          >
            {b.label}
          </text>
        ))}

        {/* The denominator row. Captioned in the gutter where the axis labels
            live: every column is full height now, so nothing else on the chart
            says how much evidence is under it. */}
        <text
          x={ML - 6}
          y={H - MB + 30}
          textAnchor="end"
          fontSize={8}
          fill={tokens.ink.muted}
          pointerEvents="none"
        >
          watches
        </text>
        {bars.map((b, i) => (
          <text
            key={`n-${i}`}
            x={cx(i)}
            y={H - MB + 30}
            textAnchor="middle"
            fontSize={9}
            fill={tokens.ink.muted}
            pointerEvents="none"
          >
            {b.n > 0 ? b.n : "-"}
          </text>
        ))}
      </svg>
    </div>
  );
}
