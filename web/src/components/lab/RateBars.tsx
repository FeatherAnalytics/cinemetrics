"use client";

import { INK } from "@/lib/palette";
import { valueLabelFill } from "@/lib/barChart";
import { useWidth } from "@/lib/useWidth";

const W0 = 720; // pre-measurement width, matching the usual desktop column
const W_MIN = 300;
const FADE = "#b3b1a6";
const MID = "#eceae3";

export type RateBar = {
  label: string;
  /** 0..1. */
  rate: number;
  /** Denominator. Printed in its own labeled row, never on the bar. */
  n: number;
};

/**
 * Below this many watches a bar is drawn faded.
 *
 * A rate over one or two watches is 0% or 100% by arithmetic, and at full
 * strength it draws the loudest bar in the chart to say the least. Filtered to
 * the Miyazaki collection, one Comedy watch produced a full-height 100% column
 * next to a 47% column standing on a hundred. Fading is the same 0.35 the
 * horizontal bar charts use for a row the reader did not select, so it reads as
 * "not the thing to look at" rather than as a new encoding.
 */
const THIN_N = 5;
const THIN_OPACITY = 0.35;

/**
 * A share per category, on a fixed 0 to 100% scale.
 *
 * Geometry, type sizes, the full-height hit area and the inside/outside label
 * flip are all lifted from `stats/CategoryBars`. What differs is the SCALE, and
 * that difference is the reason this is a second component rather than a flag on
 * the first:
 *
 * - The axis is pinned to 0-100%, not scaled to the peak. A rate is already a
 *   proportion of a known whole, so peak-scaling would redraw 46% as a
 *   full-height bar and make every panel's bars mean a different thing.
 * - The reference line is 50%, a fixed and meaningful level, not the median of
 *   the categories. The median of five bands is a property of how the bands were
 *   cut; 50% is the point where the heart stops being the likely answer.
 *
 * TWO NUMBERS, TWO PLACES. The bar is labeled with its rate; the denominator
 * sits in its own row under the axis, captioned "watches". They were both on the
 * bar at first, with only the count printed, on the reasoning that the axis
 * already carried the rate. That failed the first reader it met: at 1 star the
 * rate is 0%, so there is no bar to see, and the floating "2" read as the value.
 * "Does that mean I liked 2 films I rated 1 star?" It means two watches were
 * rated 1 star and none were hearted.
 *
 * A share is also unreadable without its denominator (100% of two watches and
 * 73% of two hundred are not the same claim), so the count cannot simply be
 * dropped. It has to be somewhere it cannot be mistaken for the bar's value, and
 * a captioned row is that somewhere.
 */
export function RateBars({
  bars,
  active,
  onPick,
  accent = "#c01023",
  refAt = 0.5,
  refLabel = "coin flip",
}: {
  bars: RateBar[];
  /** Index currently driving the selection, drawn in the accent. */
  active?: number | null;
  onPick?: (index: number) => void;
  /** Highlight color, so a genre filter recolors the chart. */
  accent?: string;
  /**
   * Where the reference line sits, 0..1. Travels with `refLabel` as a pair: the
   * line and the words naming it have to be the same number, or the chart is
   * captioned with a level it does not draw.
   */
  refAt?: number;
  refLabel?: string;
}) {
  const [ref, W] = useWidth(W0, W_MIN);
  // MB carries two rows now: the category label, then the count row under it.
  const H = 196;
  const ML = 40;
  const MB = 46;
  // The reference label gets its own margin rather than floating over the plot.
  // Parked inside, it landed on top of the last bar as soon as a bar reached
  // that height: "all years 46%" sat across the 2026 column. Reserving the room
  // means the line can end before the words start and neither has to move.
  const MR = 12 + (refLabel ? refLabel.length * 4.7 + 8 : 0);

  const plotW = W - ML - MR;
  const colW = plotW / Math.max(bars.length, 1);
  const barW = Math.min(colW - 10, 46);

  const y = (v: number) => H - MB - v * (H - MB - 14);
  const cx = (i: number) => ML + (i + 0.5) * colW;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" style={{ maxWidth: "100%" }}>
        {[0, 0.5, 1].map((v) => (
          <g key={`t-${v}`}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke="#eee" />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
              {pct(v)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => (
          <g key={`bar-${i}`}>
            {/* An empty category gets a flat tint where its bar would be, so the
                gap reads as "nothing recorded here" rather than as a zero rate.
                A 0% bar and no data are different claims and would otherwise
                draw identically: as nothing. */}
            {b.n === 0 && (
              <rect
                x={cx(i) - barW / 2}
                y={H - MB - 3}
                width={barW}
                height={3}
                fill={MID}
              />
            )}
            {b.n > 0 && (
              <rect
                x={cx(i) - barW / 2}
                y={y(b.rate)}
                width={barW}
                height={H - MB - y(b.rate)}
                fill={active === i ? accent : FADE}
                fillOpacity={b.n < THIN_N ? THIN_OPACITY : 1}
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
            {b.n > 0 &&
              (() => {
                const barH = H - MB - y(b.rate);
                // A faded bar never takes the inside label: surface-white type
                // on a 35% fill is not readable against the paper behind it.
                const inside = barH > 24 && b.n >= THIN_N;
                return (
                  <text
                    x={cx(i)}
                    y={inside ? y(b.rate) + 15 : y(b.rate) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={valueLabelFill(inside)}
                    pointerEvents="none"
                  >
                    {pct(b.rate)}
                  </text>
                );
              })()}
          </g>
        ))}

        <line
          x1={ML}
          y1={y(refAt)}
          x2={W - MR}
          y2={y(refAt)}
          stroke={INK.muted}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
        <text
          x={W - MR + 6}
          y={y(refAt) + 3}
          textAnchor="start"
          fontSize={8}
          fill={INK.muted}
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
            fill={active === i ? accent : INK.primary}
            fontWeight={active === i ? 700 : 400}
            pointerEvents="none"
          >
            {b.label}
          </text>
        ))}

        {/* The denominator row. Captioned in the gutter where the axis labels
            live, because an uncaptioned row of numbers under a chart is exactly
            the ambiguity this is here to remove. */}
        <text
          x={ML - 6}
          y={H - MB + 30}
          textAnchor="end"
          fontSize={8}
          fill={INK.muted}
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
            fill={INK.muted}
            pointerEvents="none"
          >
            {b.n > 0 ? b.n : "-"}
          </text>
        ))}
      </svg>
    </div>
  );
}
