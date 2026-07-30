"use client";

import { useMemo } from "react";
import { hairline, useTheme, type Tokens } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { fmt1 } from "@/lib/format";
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

/**
 * One line under the shared band.
 *
 * Takes the geometry rather than building it, which is what keeps the two panels
 * honest about sitting on one axis. Only the lower panel draws year labels: two
 * identical year rows stacked 150px apart is chrome repeated, not orientation.
 */
function RollingChart({
  title,
  caption,
  points,
  domain,
  geo,
  tokens,
  bandLabel = false,
  axis = false,
}: {
  title: string;
  caption: string;
  points: { time: number; value: number }[];
  domain: [number, number];
  geo: Geometry;
  tokens: Tokens;
  bandLabel?: boolean;
  axis?: boolean;
}) {
  const plotH = H - MT - MB;
  const [lo, hi] = domain;
  const y = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * plotH;
  const bandTop = MT - (bandLabel ? LABEL_H : 0);

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
      </svg>
    </div>
  );
}

export function GradSchoolEra({ stats }: { stats: EraStats }) {
  const { tokens } = useTheme();
  const [ref, w] = useWidth(720, 320);

  const geo = useMemo<Geometry>(() => {
    // Across BOTH series, so neither line is clipped and the two agree on x. The
    // rating line starts earlier than the pace line, because 40 watches accumulate
    // before 12 months do.
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

  const ratingPoints = stats.rating.map((p) => ({ time: p.time, value: p.mean }));
  const pacePoints = stats.pace.map((p) => ({ time: p.time, value: p.filmsPerMonth }));

  const [early, , span, after] = stats.neighbors;
  const { opens, closes, vsBefore, spanPaceRange, ratingStretch } = stats;
  // Looked up rather than indexed. The sentence below names the year the climb
  // started from, and a hardcoded position in the list would keep asserting it
  // after a worse year arrived.
  const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
  const calmerThan = Math.round(100 - ratingStretch.netPercentile);

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
          bandLabel
        />
        <RollingChart
          title="Films per month"
          caption={`Trailing ${PACE_MONTHS} months. Different window, same axis, so the shading falls in the same place.`}
          points={pacePoints}
          domain={niceDomain(
            pacePoints.map((p) => p.value),
            2,
          )}
          geo={geo}
          tokens={tokens}
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
        twenty-four month window would be wider than the thing it has to resolve and would come out
        smooth across the shading whatever the viewing did. The rating takes a {RATING_WATCHES}{" "}
        watch window instead, because a fixed stretch of days holds four watches in one month and
        twelve in another, so a time-windowed rating would swing on how much I watched rather than
        on how I rated it. Inside the span {RATING_WATCHES} watches covers three to seven months, so
        that line could show a dip too.
      </p>

      <p className="mt-5 max-w-2xl text-sm font-bold" style={{ color: tokens.ink.primary }}>
        The trend walks straight through it.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        {/* One decimal on both, not `fmt1`, which drops it on a whole number and
            would print "77.3 and 78" as though the two were measured differently. */}
        The rating line enters the span at {opens.meanRating.toFixed(1)} and leaves it at{" "}
        {closes.meanRating.toFixed(1)}. It wanders in between, because {RATING_WATCHES} watches is a
        narrow window and it wanders everywhere else in the log too. What is unusual is where it
        ends up: across the span it travels {fmt1(ratingStretch.netDelta)} points net, quieter than{" "}
        {calmerThan}% of the {ratingStretch.comparable} stretches of the same length in the log. The
        climb that got it to {Math.round(opens.meanRating)} is finished before the shading starts,
        running up from {fmt1(trough.mean)} in {trough.year}.
      </p>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        The pace line is not flat inside the span and it would be wrong to call it so. It falls to{" "}
        {fmt1(spanPaceRange.low.filmsPerMonth)} films a month by{" "}
        {monthLabel(spanPaceRange.low.key)} and recovers to{" "}
        {fmt1(spanPaceRange.high.filmsPerMonth)} by {monthLabel(spanPaceRange.high.key)}, finishing
        higher than it began. What it does not do is break at either edge. The fall from the early
        years is over before the span opens, and the steepest decline anywhere in the log comes
        after it closes rather than during it: {fmt1(after.per30)} watches per 30 days in the twelve
        months after, against {fmt1(span.per30)} inside.
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
          . The percentile above is a rank among overlapping stretches rather than a test, so it
          says the span was calm, not that its calm was surprising.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          An earlier draft of this section reported the span rating 5.0 points above everything
          outside it. That was real arithmetic and a bad comparison: {early.watches} of the{" "}
          {stats.outsideWatches} watches outside the span sit in the early years at a mean of{" "}
          {fmt1(early.meanRating)}, so the figure was mostly measuring the distance from 2019. Set
          against the years on either side, it goes away.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          So: this is when I was in school, and this is where the lines went. It is not evidence
          that school did it.
        </p>
      </div>
    </div>
  );
}
