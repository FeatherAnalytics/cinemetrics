"use client";

import { INK } from "@/lib/palette";
import { valueLabelFill } from "@/lib/barChart";
import { quantile } from "@/lib/statsChart";
import { useWidth } from "@/lib/useWidth";

const W0 = 720; // pre-measurement width, matching the usual desktop column
const W_MIN = 300;
const FADE = "#b3b1a6";
const MID = "#eceae3";

export type CategoryBar = {
  label: string;
  value: number;
  title: string;
  /** Watch keys this bar stands for; clicking selects them. */
  keys: string[];
};

/**
 * Watch count (or rate) per category, against the median bucket.
 *
 * The median is a y-axis TICK rather than an annotation floating in the plot: it
 * reads as what it is, a value on the scale, and it can never land on top of a
 * bar. It is the median and not the mean because with a spike the size of
 * October a mean sits above most of the months it is supposed to baseline.
 *
 * Clicking a bar cross-filters to the watches behind it, the same contract the
 * main-page charts use. Clicking the active bar again clears.
 */
export function CategoryBars({
  bars,
  highlight,
  active,
  onPick,
  fmt = (v: number) => String(Math.round(v)),
  accent = "#c01023",
  showShare = false,
}: {
  bars: CategoryBar[];
  /** Indices given a flat backdrop tint, e.g. the weekend. */
  highlight?: number[];
  /** Index currently driving the selection, drawn in the accent. */
  active?: number | null;
  onPick?: (index: number) => void;
  fmt?: (v: number) => string;
  /** Highlight color, so a genre filter recolors the chart. */
  accent?: string;
  /**
   * Print each bar's distance from the median as a PERCENTAGE, under the axis
   * label.
   *
   * A raw difference is already in the picture: the bars are drawn against a
   * median gridline, so "+47" is the gap the reader can see. A percentage is
   * the part that cannot be eyeballed, and it is the honest way to compare a
   * gap against the level it departs from.
   *
   * Only meaningful where the value is a count on a ratio scale with a
   * non-zero median. Not used on the pace chart, whose `fmt` is a reciprocal:
   * a percentage of a rate rendered as a duration is not a number.
   */
  showShare?: boolean;
}) {
  // Width tracks the column, height is fixed: there is no viewBox, so one user
  // unit is one pixel and the type stays the same size at every width.
  const [ref, W] = useWidth(W0, W_MIN);
  const H = 180;
  const MR = 12;
  const MB = 30;

  const peak = Math.max(...bars.map((b) => b.value), 0.0001);
  const median = quantile(
    bars.map((b) => b.value).sort((a, b) => a - b),
    0.5,
  );

  // The gutter sizes to its widest label rather than a fixed number: axis labels
  // are caller-formatted, so "median 64" and "median 3.7" differ enough that a
  // fixed width clipped the longer one.
  const axisLabels = [fmt(0), fmt(peak), `median ${fmt(median)}`];
  const ML = Math.max(34, Math.max(...axisLabels.map((l) => l.length)) * 4.7 + 10);

  const plotW = W - ML - MR;
  const colW = plotW / bars.length;
  const barW = Math.min(colW - 10, 46);

  const y = (v: number) => H - MB - (v / peak) * (H - MB - 14);
  const cx = (i: number) => ML + (i + 0.5) * colW;
  const hot = new Set(highlight ?? []);

  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" style={{ maxWidth: "100%" }}>
        {/* Backdrop tint sits behind everything, at the lowest contrast that still
            separates: one flat band, no border, no second color. */}
        {[...hot].map((i) => (
          <rect
            key={`hl-${i}`}
            x={cx(i) - colW / 2}
            y={0}
            width={colW}
            height={H - MB + 4}
            fill={MID}
          />
        ))}

        {[0, peak].map((v, i) => (
          <g key={`t-${i}`}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke="#eee" />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
              {fmt(v)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => (
          <g key={`bar-${i}`}>
            <rect
              x={cx(i) - barW / 2}
              y={y(b.value)}
              width={barW}
              height={H - MB - y(b.value)}
              fill={active === i ? accent : FADE}
            />
            {/* Full-height hit area: a short bar is a small target, and the reader
                is aiming at the column, not the ink. */}
            <rect
              x={cx(i) - colW / 2}
              y={0}
              width={colW}
              height={H - MB}
              fill="transparent"
              style={{ cursor: onPick ? "pointer" : "default" }}
              onClick={onPick ? () => onPick(i) : undefined}
            >
              <title>{b.title}</title>
            </rect>
            {/* The value rides its own bar, inside when there is room, exactly
                as it does on every horizontal bar chart here: same 11px, same
                bold, same INK.surface / INK.primary flip. It used to sit under
                the axis in 8px muted type, which was a second convention for
                the same job. */}
            {(() => {
              const barH = H - MB - y(b.value);
              const inside = barH > 24;
              return (
                <text
                  x={cx(i)}
                  y={inside ? y(b.value) + 15 : y(b.value) - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={valueLabelFill(inside)}
                  pointerEvents="none"
                >
                  {fmt(b.value)}
                </text>
              );
            })()}
          </g>
        ))}

        <line
          x1={ML}
          y1={y(median)}
          x2={W - MR}
          y2={y(median)}
          stroke={INK.muted}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
        <text
          x={ML - 6}
          y={y(median) + 3}
          textAnchor="end"
          fontSize={8}
          fill={INK.muted}
          pointerEvents="none"
        >
          median {fmt(median)}
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
        {showShare &&
          bars.map((b, i) => {
            // Against the median rather than the mean: with a spike the size of
            // October a mean sits above most of the values it is baselining, so
            // almost every bar would read negative.
            const pct = median > 0 ? Math.round((100 * (b.value - median)) / median) : 0;
            return (
              <text
                key={`pct-${i}`}
                x={cx(i)}
                y={H - MB + 25}
                textAnchor="middle"
                fontSize={8}
                fill={INK.muted}
                pointerEvents="none"
              >
                {pct > 0 ? "+" : ""}
                {pct}%
              </text>
            );
          })}
      </svg>
    </div>
  );
}
