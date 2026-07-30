"use client";

import { useMemo, useRef, useState } from "react";
import { hairline, useTheme, type Tokens } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { fmt1 } from "@/lib/format";
import { LabTip } from "./LabTip";
import {
  GRAD_SCHOOL,
  monthLabel,
  PACE_MONTHS,
  RATING_WATCHES,
  timeAt,
  type EraStats,
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
 * The two lines are windowed DIFFERENTLY, which is why they come in as separate
 * series rather than as two fields of one point. See `PACE_MONTHS` and
 * `RATING_WATCHES`: a rate over time needs a window of time, and a mean rating
 * needs a window that does not move with how much I watched. They share the x
 * axis and nothing else.
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

/** "Mar 12, 2024", for a rating point, which closes on one watch. */
function dayLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A value axis rounded out to whole `step`s, so its ticks read as numbers. */
function niceDomain(values: number[], step: number): [number, number] {
  return [
    Math.floor(Math.min(...values) / step) * step,
    Math.ceil(Math.max(...values) / step) * step,
  ];
}

type Geometry = {
  /** Fractional month index to pixel. */
  x: (time: number) => number;
  bandX0: number;
  bandX1: number;
  plotW: number;
  years: { year: number; px: number }[];
};

/** One point on a rolling line, with the date the reader is shown for it. */
type LinePoint = { time: number; value: number; label: string };

/**
 * One line under the shared band.
 *
 * Takes the geometry rather than building it, which is what keeps the two panels
 * honest about sitting on one axis. Only the lower panel draws year labels: two
 * identical year rows stacked 150px apart is chrome repeated, not orientation.
 *
 * The hover readout snaps to the nearest point by x while the box follows the
 * cursor. A rolling line is a value AT A DATE, and a tooltip placed at the raw
 * pointer would report the point next to the one the marker is sitting on.
 */
function RollingChart({
  title,
  caption,
  points,
  domain,
  geo,
  tokens,
  format,
  bandLabel = false,
  axis = false,
}: {
  title: string;
  caption: string;
  points: LinePoint[];
  domain: [number, number];
  geo: Geometry;
  tokens: Tokens;
  /** The hovered value as the tooltip states it, units included. */
  format: (v: number) => string;
  bandLabel?: boolean;
  axis?: boolean;
}) {
  const plotH = H - MT - MB;
  const [lo, hi] = domain;
  const y = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * plotH;
  const bandTop = MT - (bandLabel ? LABEL_H : 0);
  const svgRef = useRef<SVGSVGElement>(null);
  // figW travels with the hover, off the same rect as the hit test, so the clamp
  // is told the width the pointer was measured against and not a later one.
  const [hover, setHover] = useState<{ x: number; y: number; figW: number; at: LinePoint } | null>(
    null,
  );

  const at = (e: React.MouseEvent): typeof hover => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = points[0];
    let bestD = Infinity;
    for (const p of points) {
      const d = Math.abs(geo.x(p.time) - px);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return { x: px, y: e.clientY - rect.top, figW: rect.width, at: best };
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${geo.x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join("");

  return (
    <div className="mt-3">
      <p className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
        {title}
      </p>
      <p className="mb-1 text-[11px]" style={{ color: tokens.ink.muted }}>
        {caption}
      </p>
      {/* Relative, so the tooltip is placed against the plot rather than against
          the section. The pointer offset is measured off this same box. */}
      <div className="relative">
        <svg
          ref={svgRef}
          width={geo.plotW + ML + MR}
          height={H}
          role="img"
          aria-label={`${title}. ${caption}`}
          onMouseMove={(e) => setHover(at(e))}
          onMouseLeave={() => setHover(null)}
        >
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
                {v}
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

          {/* The marker, in ink and not in the accent: it is chrome. A rule the
              full height of the plot rather than a dot alone, so the reader can see
              which date the readout is quoting on a line this narrow. */}
          {hover && (
            <g>
              <line
                x1={geo.x(hover.at.time)}
                x2={geo.x(hover.at.time)}
                y1={MT}
                y2={MT + plotH}
                stroke={tokens.ink.axis}
                strokeWidth={1}
              />
              <circle
                cx={geo.x(hover.at.time)}
                cy={y(hover.at.value)}
                r={3}
                fill={tokens.ink.primary}
              />
            </g>
          )}
        </svg>

        {hover && (
          <LabTip
            x={hover.x}
            y={hover.y}
            figW={hover.figW}
            figH={H}
            title={hover.at.label}
            detail={format(hover.at.value)}
          />
        )}
      </div>
    </div>
  );
}

export function GradSchoolEra({ stats }: { stats: EraStats }) {
  const { tokens } = useTheme();
  const [ref, w] = useWidth(720, 320);

  const geo = useMemo<Geometry>(() => {
    // Across BOTH series, so neither line is clipped and the two agree on x. The
    // rating line starts earlier than the pace line, because RATING_WATCHES
    // watches accumulate before PACE_MONTHS months do.
    const times = [...stats.pace.map((p) => p.time), ...stats.rating.map((p) => p.time)];
    const first = Math.min(...times);
    const last = Math.max(...times);
    const plotW = Math.max(1, w - ML - MR);
    const x = (t: number) => ML + ((t - first) / Math.max(1, last - first)) * plotW;
    const years: { year: number; px: number }[] = [];
    for (let yr = Math.ceil(first / 12); yr * 12 <= last; yr++) {
      years.push({ year: yr, px: x(yr * 12) });
    }
    return {
      x,
      plotW,
      bandX0: x(timeAt(GRAD_SCHOOL.start)),
      bandX1: x(timeAt(GRAD_SCHOOL.end)),
      years,
    };
  }, [stats.pace, stats.rating, w]);

  // The label each point carries into its tooltip. The two lines are indexed
  // differently, so they date differently: a rating point closes on a watch and
  // names its day, a pace point closes on a month and names the month.
  const ratingPoints = stats.rating.map((p) => ({
    time: p.time,
    value: p.mean,
    label: dayLabel(p.date),
  }));
  const pacePoints = stats.pace.map((p) => ({
    time: p.time,
    value: p.filmsPerMonth,
    label: monthLabel(p.key),
  }));

  const [early, , span, after] = stats.neighbors;
  const { opens, closes, vsBefore, vsOutside, spanPaceRange, ratingStretch, ratingWindowMonths } =
    stats;
  // Looked up rather than indexed. The sentence below names the year the climb
  // started from, and a hardcoded position in the list would keep asserting it
  // after a worse year arrived.
  const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));

  return (
    <div>
      <div ref={ref} style={{ maxWidth: "100%" }}>
        <RollingChart
          title="Mean rating"
          caption={`Trailing ${RATING_WATCHES} watches, plotted at the watch the window closes on.`}
          points={ratingPoints}
          domain={niceDomain(
            ratingPoints.map((p) => p.value),
            5,
          )}
          geo={geo}
          tokens={tokens}
          format={(v) => `${v.toFixed(1)} mean over ${RATING_WATCHES} watches`}
          bandLabel
        />
        <RollingChart
          title="Films per month"
          // Monthly here, weekly in the table below, and that is deliberate: a
          // twelve-month window reporting a monthly rate is self-consistent,
          // while the table's fixed stretches read more plainly per week. Said
          // out loud so a reader who spots the two units finds a choice rather
          // than a mistake.
          caption={`Trailing ${PACE_MONTHS} months, a monthly rate. The table below is per week.`}
          points={pacePoints}
          domain={niceDomain(
            pacePoints.map((p) => p.value),
            2,
          )}
          geo={geo}
          tokens={tokens}
          format={(v) => `${fmt1(v)} films a month, trailing ${PACE_MONTHS}`}
          axis
        />
      </div>

      {/* Why each window is what it is, told to the reader and not only to the
          next developer. These are the reason a quiet line means anything here,
          so leaving the argument in a code comment alone would hide it from the
          people who need it to trust the charts. */}
      <p className="mt-3 max-w-2xl text-[11px]" style={{ color: tokens.ink.muted }}>
        Two windows, because the two measures need different ones. Films per month is a rate over
        time, so it takes a {PACE_MONTHS} month window; the span is {stats.eraMonths} months, and a
        twenty-four month window would be wider than the thing it has to resolve. The rating takes
        a {RATING_WATCHES} watch window instead: a fixed stretch of days holds four watches one
        month and twelve the next, so a time-windowed rating would swing on how much I watched
        rather than on how I rated it. Inside the span one window covers{" "}
        {fmt1(ratingWindowMonths.low)} to {fmt1(ratingWindowMonths.high)} months, well short of the
        span. That is light smoothing, not a trend.
      </p>

      <p className="mt-5 max-w-2xl text-sm font-bold" style={{ color: tokens.ink.primary }}>
        The trend walks straight through it.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        {/* One decimal on both, not `fmt1`, which drops it on a whole number and
            would print "77.3 and 78" as though the two were measured differently. */}
        The rating line enters the span at {opens.meanRating.toFixed(1)} and leaves it at{" "}
        {closes.meanRating.toFixed(1)}, wandering in between. Across the span it travels {fmt1(ratingStretch.netDelta)} points net, around the{" "}
        {Math.round(ratingStretch.netPercentile)}th percentile of the {ratingStretch.comparable}{" "}
        stretches of the same length. That is a middling stretch, not a still one: no stillness
        finding here. The climb that got it to{" "}
        {Math.round(opens.meanRating)} finishes before the shading starts, running up from{" "}
        {fmt1(trough.mean)} in {trough.year}.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        The pace line is not flat inside the span. It falls to{" "}
        {fmt1(spanPaceRange.low.filmsPerMonth)} films a month by{" "}
        {monthLabel(spanPaceRange.low.key)}, recovers to{" "}
        {fmt1(spanPaceRange.high.filmsPerMonth)} by {monthLabel(spanPaceRange.high.key)}, and
        finishes higher than it began. Neither edge breaks. The fall from the early years ends
        before the span opens, and the steepest decline in the log comes after it closes:{" "}
        {fmt1(after.perWeek)} watches a week in the twelve months after against{" "}
        {fmt1(span.perWeek)} inside.
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
            <th className="py-1 text-right font-normal">Per week</th>
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
              {/* toFixed rather than fmt1: a column of 2.6 / 1.6 / 1.8 with a
                  bare 1 in it reads as a different measure, and fmt1 drops the
                  decimal on a whole number. */}
              <td className="py-1 text-right">{win.perWeek.toFixed(1)}</td>
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
          A chart cannot establish an absence. Against the year on each side,{" "}
          {vsBefore.ratingIsNoise
            ? `the rating moves ${fmt1(vsBefore.ratingDiff)} points, inside what ${span.watches} watches can resolve`
            : `the rating moves ${fmt1(vsBefore.ratingDiff)} points, which is now large enough to read, so this sentence needs rewriting`}
          , and{" "}
          {vsBefore.volumeIsNoise
            ? "the viewing rate is indistinguishable"
            : "the viewing rate now differs, so this sentence needs rewriting"}
          . The percentile above is a rank among overlapping stretches rather than a test. It
          locates the span, which is not evidence about it.
        </p>
        {/* The baseline trap this library is prone to, stated as a property of
            the data rather than as a note about what the page used to say. A
            reader meeting the bigger number somewhere else needs to be able to
            find out here why it is the wrong one. */}
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          Set the span against everything outside it and the rating looks{" "}
          {fmt1(vsOutside.ratingDiff)} points higher. That is the wrong comparison:{" "}
          {early.watches} of the {stats.outsideWatches} watches outside the span are early years,
          at {fmt1(early.meanRating)}, so it mostly measures the distance from those. Against the
          neighbors in the table above, the gap goes away.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          This is when I was in school and this is where the lines went. It is not evidence that
          school did it.
        </p>
      </div>
    </div>
  );
}
