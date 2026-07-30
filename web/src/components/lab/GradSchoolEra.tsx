"use client";

import { useMemo } from "react";
import { hairline, useTheme, type Tokens } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { fmt1 } from "@/lib/format";
import {
  GRAD_SCHOOL,
  monthIndex,
  monthLabel,
  TREND_MONTHS,
  type EraStats,
  type RollingPoint,
} from "@/lib/gradSchool";

/**
 * The years I was in school, marked on two rolling lines that share one time axis.
 *
 * The swim lane cannot host this. It wraps the log into one lane per year, so a
 * span running August to May would be drawn as two disconnected pieces on two
 * rows, which is the opposite of what a span is.
 *
 * TWO CHARTS AND ONE SHARED SCALE. The band and the x domain are computed once in
 * the parent and handed to both panels rather than each panel deriving its own.
 * That is not only less code: a reader comparing two charts has to be able to
 * trust that the shading sits in the same place on both, and the cheapest way to
 * earn that is for there to be exactly one copy of the geometry.
 *
 * Individual ratings are deliberately not plotted behind the rating line. On a 0
 * to 100 axis 795 dots flatten it to nearly straight, and the shape of that line
 * is the whole content of the section.
 *
 * No accent anywhere. An era band is chrome, and crimson is genre identity, the
 * diverging ramp and the heart.
 */

const H = 150;
const ML = 34;
const MR = 12;
/**
 * Room above a plot. Enough that the band label, which only the upper panel
 * carries, clears the top of the SVG: its baseline sits at `MT - LABEL_H - 5`,
 * and an 11px label needs about 11px of headroom above the box to not be cut.
 */
const MT = 28;
const MB = 20;
const LABEL_H = 10;

/** A value axis rounded out to whole `step`s, so its ticks read as numbers. */
function niceDomain(values: number[], step: number): [number, number] {
  return [
    Math.floor(Math.min(...values) / step) * step,
    Math.ceil(Math.max(...values) / step) * step,
  ];
}

type Geometry = {
  /** Month index to pixel. */
  x: (month: number) => number;
  bandX0: number;
  bandX1: number;
  plotW: number;
  years: { year: number; px: number }[];
};

/**
 * One rolling line under the shared band.
 *
 * Takes the geometry rather than building it, which is what keeps the two panels
 * honest about sitting on one axis. Only the lower panel draws year labels: two
 * identical year rows stacked 150px apart is chrome repeated, not orientation.
 */
function RollingChart({
  title,
  caption,
  series,
  value,
  domain,
  decimals,
  geo,
  tokens,
  bandLabel = false,
  axis = false,
}: {
  title: string;
  caption: string;
  series: RollingPoint[];
  value: (p: RollingPoint) => number | null;
  domain: [number, number];
  decimals: number;
  geo: Geometry;
  tokens: Tokens;
  bandLabel?: boolean;
  axis?: boolean;
}) {
  const plotH = H - MT - MB;
  const [lo, hi] = domain;
  const y = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * plotH;
  const bandTop = MT - (bandLabel ? LABEL_H : 0);

  const d = series
    .map((p) => {
      const v = value(p);
      return v == null ? null : `${geo.x(p.month).toFixed(1)},${y(v).toFixed(1)}`;
    })
    .filter((s): s is string => s != null)
    .map((s, i) => `${i === 0 ? "M" : "L"}${s}`)
    .join("");

  return (
    <div className="mt-3">
      <p className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
        {title}
      </p>
      <p className="mb-1 text-[11px]" style={{ color: tokens.ink.muted }}>
        {caption}
      </p>
      <svg width={geo.plotW + ML + MR} height={H} role="img" aria-label={`${title}. ${caption}`}>
        <rect
          x={geo.bandX0}
          y={bandTop}
          width={geo.bandX1 - geo.bandX0}
          height={MT + plotH - bandTop}
          fill={hairline(tokens.ink.primary, 7)}
        />
        {[geo.bandX0, geo.bandX1].map((bx) => (
          <line
            key={bx}
            x1={bx}
            y1={bandTop}
            x2={bx}
            y2={MT + plotH}
            stroke={tokens.ink.axis}
            strokeWidth={1}
          />
        ))}
        {bandLabel && (
          <text
            x={(geo.bandX0 + geo.bandX1) / 2}
            y={bandTop - 5}
            textAnchor="middle"
            fontSize={11}
            fill={tokens.ink.secondary}
          >
            in school, {monthLabel(GRAD_SCHOOL.start)} to {monthLabel(GRAD_SCHOOL.end)}
          </text>
        )}

        {[lo, hi].map((v) => (
          <g key={v}>
            <line
              x1={ML}
              y1={y(v)}
              x2={ML + geo.plotW}
              y2={y(v)}
              stroke={tokens.ink.grid}
              strokeWidth={0.5}
            />
            <text
              x={ML - 5}
              y={y(v) + 3}
              textAnchor="end"
              fontSize={10}
              fill={tokens.ink.muted}
              className="tabular-nums"
            >
              {v.toFixed(decimals)}
            </text>
          </g>
        ))}

        <path
          d={d}
          fill="none"
          stroke={tokens.ink.primary}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {axis &&
          geo.years.map(({ year, px }) => (
            <text
              key={year}
              x={px}
              y={H - 5}
              textAnchor="middle"
              fontSize={10}
              fill={tokens.ink.muted}
              className="tabular-nums"
            >
              {year}
            </text>
          ))}
      </svg>
    </div>
  );
}

export function GradSchoolEra({ stats }: { stats: EraStats }) {
  const { tokens } = useTheme();
  const [ref, w] = useWidth(720, 320);

  const geo = useMemo<Geometry>(() => {
    const first = stats.series[0].month;
    const last = stats.series[stats.series.length - 1].month;
    const plotW = Math.max(1, w - ML - MR);
    const x = (m: number) => ML + ((m - first) / Math.max(1, last - first)) * plotW;
    const years: { year: number; px: number }[] = [];
    for (let yr = Math.ceil(first / 12); yr * 12 <= last; yr++) {
      years.push({ year: yr, px: x(yr * 12) });
    }
    return {
      x,
      plotW,
      bandX0: x(monthIndex(GRAD_SCHOOL.start)),
      bandX1: x(monthIndex(GRAD_SCHOOL.end)),
      years,
    };
  }, [stats.series, w]);

  const volumeDomain = niceDomain(
    stats.series.map((p) => p.filmsPerMonth),
    2,
  );
  const ratingDomain = niceDomain(
    stats.series.map((p) => p.meanRating).filter((r): r is number => r != null),
    5,
  );

  const [early, , span, after] = stats.neighbors;
  const { opens, closes, vsBefore, spanVolumeRange } = stats;
  // Looked up rather than indexed. The sentence below names the year the climb
  // started from, and hardcoding a position in the list would keep asserting it
  // after a worse year arrived.
  const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));

  return (
    <div>
      <div ref={ref} style={{ maxWidth: "100%" }}>
        <RollingChart
          title="Films per month"
          caption={`Trailing ${TREND_MONTHS} months, plotted at the month the window closes.`}
          series={stats.series}
          value={(p) => p.filmsPerMonth}
          domain={volumeDomain}
          decimals={0}
          geo={geo}
          tokens={tokens}
          bandLabel
        />
        <RollingChart
          title="Mean rating"
          caption="Same window and the same axis, so the shading falls in the same place on both."
          series={stats.series}
          value={(p) => p.meanRating}
          domain={ratingDomain}
          decimals={0}
          geo={geo}
          tokens={tokens}
          axis
        />
      </div>

      {/* Why the window is what it is, told to the reader and not only to the next
          developer. It is the reason a flat line means anything here, so leaving
          the argument in a code comment alone would hide it from the people who
          need it to trust the chart. */}
      <p className="mt-3 max-w-2xl text-[11px]" style={{ color: tokens.ink.muted }}>
        Twelve months and not twenty-four. The span is {stats.eraMonths} months, so a twenty-four
        month window would be wider than the thing it has to resolve and would come out smooth
        across the shading whatever the viewing did. Twelve covers the span about twice, so a real
        dip inside it would show.
      </p>

      <p className="mt-5 max-w-2xl text-sm font-bold" style={{ color: tokens.ink.primary }}>
        The trend walks straight through it.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        The rating line enters the span at {fmt1(opens.meanRating)} and leaves it at{" "}
        {fmt1(closes.meanRating)}. Neither edge produces a step, and the climb that got it up there
        is finished before the shading starts: it runs from {fmt1(trough.mean)} in {trough.year} to{" "}
        {fmt1(opens.meanRating)} by {monthLabel(GRAD_SCHOOL.start)}.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        The volume line is not flat inside the span and it would be wrong to call it so. It falls
        to {fmt1(spanVolumeRange.low.filmsPerMonth)} films a month by{" "}
        {monthLabel(spanVolumeRange.low.key)} and recovers to{" "}
        {fmt1(spanVolumeRange.high.filmsPerMonth)} by {monthLabel(spanVolumeRange.high.key)},
        finishing higher than it began. What it does not do is break at either edge. The fall from
        the early years is over before the span opens, and the steepest decline anywhere in the log
        comes after it closes rather than during it: {fmt1(after.per30)} watches per 30 days in the
        twelve months after, against {fmt1(span.per30)} inside.
      </p>

      {/* The honest comparison, and the reason this section does not quote the
          span against everything else. Four rows rather than a sentence, so a
          reader who only skims still sees that the level was already up before the
          shading starts. */}
      <table className="mt-5 w-full max-w-lg text-sm">
        <thead>
          <tr style={{ color: tokens.ink.muted }}>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">Watches</th>
            <th className="py-1 text-right font-normal">Per 30 days</th>
            <th className="py-1 text-right font-normal">Mean rating</th>
          </tr>
        </thead>
        <tbody className="tabular-nums" style={{ color: tokens.ink.primary }}>
          {stats.neighbors.map((win) => (
            <tr
              key={win.label}
              style={{
                borderTop: `1px solid ${tokens.ink.grid}`,
                fontWeight: win.label === span.label ? 700 : 400,
              }}
            >
              <td className="py-1" style={{ color: tokens.ink.secondary }}>
                {win.label}
              </td>
              <td className="py-1 text-right">{win.watches}</td>
              <td className="py-1 text-right">{fmt1(win.per30)}</td>
              <td className="py-1 text-right">{fmt1(win.meanRating)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border-t pt-4" style={{ borderColor: tokens.ink.grid }}>
        <p className="max-w-2xl text-sm font-bold" style={{ color: tokens.ink.primary }}>
          What this cannot do is show that nothing happened.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          A chart cannot establish an absence, and none of this proves school changed nothing about
          how I watched. Set the span against the year on each side and{" "}
          {vsBefore.ratingIsNoise
            ? `the rating moves ${fmt1(vsBefore.ratingDiff)} points, inside what ${span.watches} watches can resolve`
            : `the rating moves ${fmt1(vsBefore.ratingDiff)} points, which is now large enough to read, so this sentence needs rewriting`}
          , and{" "}
          {vsBefore.volumeIsNoise
            ? "the viewing rate is indistinguishable from the year before it"
            : "the viewing rate now differs from the year before it, so this sentence needs rewriting"}
          . An earlier draft of this section reported the span rating 5.0 points above everything
          outside it. That was real arithmetic and a bad comparison: {early.watches} of the{" "}
          {stats.outsideWatches} watches outside the span sit in the early years at a mean of{" "}
          {fmt1(early.meanRating)}, so the figure was mostly measuring the distance from 2019.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          What the charts do support is narrower and still worth having. Across {stats.eraMonths}{" "}
          months that had every reason to interrupt the habit, on a window narrow enough to have
          caught it, neither line does anything it was not already doing. So: this is when I was in
          school, and this is where the lines went. Make of it what you like.
        </p>
      </div>
    </div>
  );
}
