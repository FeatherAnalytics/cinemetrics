"use client";

import { INK } from "@/lib/palette";
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
}: {
  bars: CategoryBar[];
  /** Indices given a flat backdrop tint, e.g. the weekend. */
  highlight?: number[];
  /** Index currently driving the selection, drawn in the accent. */
  active?: number | null;
  onPick?: (index: number) => void;
  fmt?: (v: number) => string;
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
              fill={active === i ? "#c01023" : FADE}
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
            fill={active === i ? "#c01023" : INK.primary}
            fontWeight={active === i ? 700 : 400}
            pointerEvents="none"
          >
            {b.label}
          </text>
        ))}
        {bars.map((b, i) => (
          <text
            key={`n-${i}`}
            x={cx(i)}
            y={H - MB + 25}
            textAnchor="middle"
            fontSize={8}
            fill={INK.muted}
            pointerEvents="none"
          >
            {fmt(b.value)}
          </text>
        ))}
      </svg>
    </div>
  );
}
