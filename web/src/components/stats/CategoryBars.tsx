"use client";

import { ACCENT } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { valueLabelFill } from "@/lib/barChart";
import { quantile } from "@/lib/statsChart";
import { useWidth } from "@/lib/useWidth";

const W0 = 720; // pre-measurement width, matching the usual desktop column
const W_MIN = 300;

export type CategoryBar = {
  label: string;
  value: number;
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
  accent = ACCENT,
  barLabel = "value",
  onHover,
  showMedian = true,
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
   * What the label ON the bar says.
   *
   * "value" prints `fmt(value)`. "share" prints the bar's distance from the
   * median as a percentage instead.
   *
   * Use "share" wherever the y axis already carries the value, which is the
   * usual case: the ticks run 0 to the peak with the median marked, so a count
   * on the bar as well is the same number twice. The percentage is the part
   * the axis cannot give, and it states the gap against the level it departs
   * from rather than against nothing.
   *
   * "share" needs a value on a ratio scale with a non-zero median. Not for the
   * pace chart, whose `fmt` is a reciprocal: a percentage of a rate printed as
   * a duration is not a number that means anything.
   */
  barLabel?: "value" | "share";
  /**
   * Hovered column index, or null on leave. The PARENT renders the readout, in
   * its own strip above the chart, the way the cumulative chart does.
   *
   * Deliberately not an SVG `<title>`: that renders the browser's native
   * tooltip, a gray OS box with its own font and its own half-second delay,
   * which looks nothing like anything else here. Omit this prop and the chart
   * simply has no hover.
   */
  onHover?: (index: number | null) => void;
  /**
   * Draw the median tick. On by default.
   *
   * Off for a chart whose x axis is already a value scale: the watchlist's
   * ratings histogram runs 1★ to 5★, so a median drawn across the COUNT axis
   * marks the middle of the bar heights, which is a fact about the chart's own
   * shape rather than about the ratings. The median that matters there is a
   * position along x, and it goes in the takeaway instead.
   */
  showMedian?: boolean;
}) {
  const { tokens } = useTheme();
  const FADE = tokens.ink.grid;
  const MID = tokens.surface.well;

  // Width tracks the column, height is fixed: there is no viewBox, so one user
  // unit is one pixel and the type stays the same size at every width.
  const [ref, W] = useWidth(W0, W_MIN);
  const H = 180;
  const MR = 12;
  const MB = 30;

  const peak = Math.max(...bars.map((b) => b.value), 0.0001);
  /**
   * Median over categories that actually had a watch.
   *
   * Including the empty ones describes the AXIS rather than the viewing, and
   * under a small filter it goes properly wrong: filtered to a nine-watch
   * collection, six of the twelve months are zero, so the median landed
   * halfway into the empty half and the pace chart printed "median 496.0"
   * days between films. With the full library every category is non-empty and
   * this changes nothing.
   */
  const live = bars.map((b) => b.value).filter((v) => v > 0).sort((a, b) => a - b);
  const median = quantile(live, 0.5);

  // The gutter sizes to its widest label rather than a fixed number: axis labels
  // are caller-formatted, so "median 64" and "median 3.7" differ enough that a
  // fixed width clipped the longer one.
  const axisLabels = showMedian ? [fmt(0), fmt(peak), `median ${fmt(median)}`] : [fmt(0), fmt(peak)];
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
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={tokens.ink.grid} strokeOpacity={0.4} />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={tokens.ink.muted}>
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
              onMouseEnter={onHover ? () => onHover(i) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
            />
            {/* The label rides its own bar, inside when there is room, exactly
                as it does on every horizontal bar chart here: same 11px, same
                bold, same INK.surface / INK.primary flip.

                An EMPTY category gets no label at all. There is no bar to label
                and nothing happened to describe; under a small filter the
                weekday chart was printing "0" and "-100%" on days that simply
                had no watches, which is noise dressed as a finding. */}
            {b.value > 0 &&
              (() => {
                const barH = H - MB - y(b.value);
                const inside = barH > 24;
                const pct = median > 0 ? Math.round((100 * (b.value - median)) / median) : 0;
                return (
                  <text
                    x={cx(i)}
                    y={inside ? y(b.value) + 15 : y(b.value) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={valueLabelFill(inside, tokens.ink)}
                    pointerEvents="none"
                  >
                    {barLabel === "share"
                      ? `${pct > 0 ? "+" : ""}${pct}%`
                      : fmt(b.value)}
                  </text>
                );
              })()}
          </g>
        ))}

        {showMedian && (
          <>
            <line
              x1={ML}
              y1={y(median)}
              x2={W - MR}
              y2={y(median)}
              stroke={tokens.ink.muted}
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            <text
              x={ML - 6}
              y={y(median) + 3}
              textAnchor="end"
              fontSize={8}
              fill={tokens.ink.muted}
              pointerEvents="none"
            >
              median {fmt(median)}
            </text>
          </>
        )}

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
      </svg>
    </div>
  );
}
