"use client";

import { scaleLinear } from "d3";
import { useTheme } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { ratingLabel, ratioLabel, signedLabel, type TravelStats } from "@/lib/travelStats";

/**
 * PROTOTYPE 2. Travel days against ordinary days, on the measures that answer.
 *
 * Three measures, two marks each, which is the whole chart. Two of them carry the
 * real finding and the third is a NULL RESULT drawn as a null result: the rating
 * panel plots each mean with its 95% interval, and the two intervals overlap so
 * heavily that the picture states "unchanged" without a caption having to.
 *
 * A bar for the rating would have been the wrong mark. Two bars at 71.9 and 73.5
 * with an axis from zero look identical, and with a clipped axis they look
 * different, and neither drawing says which of those is true. An interval says it.
 */

const AXIS_H = 22;
const ROW_H = 34;

type Side = { label: string; note: string };

const SIDES: [Side, Side] = [
  { label: "Travel days", note: "in the air" },
  { label: "Ordinary days", note: "on the ground" },
];

/** A two-bar panel for a measure where zero is the meaningful baseline. */
function BarPair({
  width,
  values,
  domainMax,
  format,
  ink,
  grid,
  axis,
  muted,
  mark,
}: {
  width: number;
  values: [number, number];
  domainMax: number;
  format: (v: number) => string;
  ink: string;
  grid: string;
  axis: string;
  muted: string;
  mark: string;
}) {
  const padLeft = 96;
  const padRight = 52;
  const inner = Math.max(width - padLeft - padRight, 40);
  const x = scaleLinear().domain([0, domainMax]).range([0, inner]);
  const height = ROW_H * 2 + AXIS_H;

  return (
    <svg width={width} height={height} style={{ maxWidth: "100%" }} role="img">
      {x.ticks(4).map((t) => (
        <g key={t}>
          <line
            x1={padLeft + x(t)}
            x2={padLeft + x(t)}
            y1={0}
            y2={ROW_H * 2}
            stroke={grid}
            strokeWidth={1}
          />
          <text
            x={padLeft + x(t)}
            y={ROW_H * 2 + 14}
            textAnchor="middle"
            fontSize={10}
            fill={muted}
            fontFamily="var(--font-mono), monospace"
          >
            {t}
          </text>
        </g>
      ))}

      {values.map((v, i) => (
        <g key={SIDES[i].label}>
          <text
            x={padLeft - 8}
            y={i * ROW_H + ROW_H / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={11}
            fill={ink}
          >
            {SIDES[i].label}
          </text>
          {/* The travel side is drawn in full ink and the ordinary side in the
              neutral mark tone. Weight, not hue: the accent is data-only and this
              is emphasis. */}
          <rect
            x={padLeft}
            y={i * ROW_H + 7}
            width={Math.max(x(v), 1)}
            height={ROW_H - 14}
            fill={i === 0 ? ink : mark}
          />
          <text
            x={padLeft + x(v) + 6}
            y={i * ROW_H + ROW_H / 2}
            dominantBaseline="middle"
            fontSize={11}
            fill={ink}
            fontFamily="var(--font-mono), monospace"
            className="tabular-nums"
          >
            {format(v)}
          </text>
        </g>
      ))}

      <line x1={padLeft} x2={padLeft} y1={0} y2={ROW_H * 2} stroke={axis} strokeWidth={1} />
    </svg>
  );
}

export function TravelComparison({ stats }: { stats: TravelStats }) {
  const { tokens } = useTheme();
  const [ref, width] = useWidth(560, 300);
  const { travel, ordinary } = stats;

  // One rating axis for both intervals, widened to hold whichever whisker runs
  // furthest plus a little air, so no interval is clipped at an edge and made to
  // look shorter than it is.
  const halfT = 1.96 * travel.seRating;
  const halfO = 1.96 * ordinary.seRating;
  const lo = Math.min(travel.meanRating - halfT, ordinary.meanRating - halfO) - 2;
  const hi = Math.max(travel.meanRating + halfT, ordinary.meanRating + halfO) + 2;

  const padLeft = 96;
  const padRight = 52;
  const inner = Math.max(width - padLeft - padRight, 40);
  const xr = scaleLinear().domain([lo, hi]).range([0, inner]);
  const ratingH = ROW_H * 2 + AXIS_H;

  return (
    <div ref={ref}>
      <div className="grid grid-cols-1 gap-8">
        <section>
          <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
            Films per viewing day
          </h4>
          <p className="mt-0.5 mb-2 text-xs" style={{ color: tokens.ink.muted }}>
            {ratioLabel(stats.filmsPerDayRatio)} more. {travel.watches} watches over{" "}
            {travel.days} flight days against {ordinary.watches} over {ordinary.days} others.
          </p>
          <BarPair
            width={width}
            values={[travel.filmsPerDay, ordinary.filmsPerDay]}
            domainMax={Math.ceil(travel.filmsPerDay * 2) / 2}
            format={(v) => v.toFixed(2)}
            ink={tokens.ink.primary}
            grid={tokens.ink.grid}
            axis={tokens.ink.axis}
            muted={tokens.ink.muted}
            mark={tokens.ink.mark}
          />
        </section>

        <section>
          <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
            Share of days holding more than one film
          </h4>
          <p className="mt-0.5 mb-2 text-xs" style={{ color: tokens.ink.muted }}>
            {ratioLabel(stats.multiFilmRatio)} likelier. {travel.multiFilmDays} of {travel.days}{" "}
            against {ordinary.multiFilmDays} of {ordinary.days}. The sharper version of the same
            finding, and the one resting on the fewest assumptions.
          </p>
          <BarPair
            width={width}
            values={[travel.multiFilmShare * 100, ordinary.multiFilmShare * 100]}
            domainMax={80}
            format={(v) => `${Math.round(v)}%`}
            ink={tokens.ink.primary}
            grid={tokens.ink.grid}
            axis={tokens.ink.axis}
            muted={tokens.ink.muted}
            mark={tokens.ink.mark}
          />
        </section>

        <section>
          <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
            Mean rating, with 95% intervals
          </h4>
          <p className="mt-0.5 mb-2 text-xs" style={{ color: tokens.ink.muted }}>
            {stats.ratingGapIsNoise ? "Unchanged" : "Changed"}. {signedLabel(stats.ratingDiff)}{" "}
            points on {travel.ratingN} watches, and the interval on that gap runs{" "}
            {signedLabel(stats.ratingDiffCi[0])} to {signedLabel(stats.ratingDiffCi[1])}, so it
            {stats.ratingGapIsNoise ? " includes no change at all" : " excludes no change"}. Both
            medians are {travel.medianRating}.
          </p>
          <svg width={width} height={ratingH} style={{ maxWidth: "100%" }} role="img">
            {xr.ticks(5).map((t) => (
              <g key={t}>
                <line
                  x1={padLeft + xr(t)}
                  x2={padLeft + xr(t)}
                  y1={0}
                  y2={ROW_H * 2}
                  stroke={tokens.ink.grid}
                  strokeWidth={1}
                />
                <text
                  x={padLeft + xr(t)}
                  y={ROW_H * 2 + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={tokens.ink.muted}
                  fontFamily="var(--font-mono), monospace"
                >
                  {t}
                </text>
              </g>
            ))}

            {([
              [travel.meanRating, halfT, travel.medianRating],
              [ordinary.meanRating, halfO, ordinary.medianRating],
            ] as const).map(([mean, half, median], i) => {
              const cy = i * ROW_H + ROW_H / 2;
              const color = i === 0 ? tokens.ink.primary : tokens.ink.mark;
              return (
                <g key={SIDES[i].label}>
                  <text
                    x={padLeft - 8}
                    y={cy}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={tokens.ink.primary}
                  >
                    {SIDES[i].label}
                  </text>
                  {/* Whisker, then the mean on top of it. The ordinary side's
                      interval is narrow enough at n=774 to disappear behind its
                      own dot, which is the correct picture: the uncertainty being
                      argued about is almost entirely the travel side's. */}
                  <line
                    x1={padLeft + xr(mean - half)}
                    x2={padLeft + xr(mean + half)}
                    y1={cy}
                    y2={cy}
                    stroke={color}
                    strokeWidth={2}
                  />
                  {[mean - half, mean + half].map((end) => (
                    <line
                      key={end}
                      x1={padLeft + xr(end)}
                      x2={padLeft + xr(end)}
                      y1={cy - 5}
                      y2={cy + 5}
                      stroke={color}
                      strokeWidth={2}
                    />
                  ))}
                  <circle cx={padLeft + xr(mean)} cy={cy} r={4} fill={color} />
                  {/* The median as a hollow tick. Both sides are 70, and two ticks
                      at the same x is the shortest statement that the middle of the
                      distribution did not move at all. */}
                  <line
                    x1={padLeft + xr(median)}
                    x2={padLeft + xr(median)}
                    y1={cy - 9}
                    y2={cy + 9}
                    stroke={tokens.ink.secondary}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <text
                    x={padLeft + xr(mean + half) + 6}
                    y={cy}
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={tokens.ink.primary}
                    fontFamily="var(--font-mono), monospace"
                    className="tabular-nums"
                  >
                    {ratingLabel(mean)}
                  </text>
                </g>
              );
            })}

            {/* No left rule on this panel, unlike the two above. A vertical line
                at the edge of a plot reads as the baseline, and this axis starts at
                65 rather than zero, so a rule there would assert a zero the scale
                does not have. The bar panels keep theirs because zero is genuinely
                where their marks begin. */}
          </svg>
          <p className="mt-2 text-xs" style={{ color: tokens.ink.muted }}>
            Dashed tick is the median. The rating axis does not start at zero, which is why the
            marks are intervals and not bars: a clipped bar exaggerates a gap this size, and a
            zeroed one hides it. The interval is the honest mark because it shows how little the
            21 watches pin down.
          </p>
        </section>
      </div>
    </div>
  );
}
