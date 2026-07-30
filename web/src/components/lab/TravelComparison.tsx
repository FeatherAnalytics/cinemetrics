"use client";

import { useRef, useState } from "react";
import { scaleLinear } from "d3";
import { useTheme } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { ratingLabel, ratioLabel, signedLabel, type TravelStats } from "@/lib/travelStats";
import { LabTip } from "./LabTip";

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

/** Where the pointer is in a two-row panel, and which row it is over. */
type RowHover = { x: number; y: number; figW: number; row: 0 | 1 };

/**
 * The row under the pointer, or nothing.
 *
 * A hit test off the pointer's y rather than handlers on the marks themselves.
 * The marks are a 2.10 bar and a 1.12 bar, so a reader chasing the short one
 * would be chasing a target half the width of the other, and on the rating panel
 * the mark is a whisker a few pixels tall. Row bands make both sides the same
 * size to hit and cost no extra element in the SVG.
 */
function rowAt(e: React.MouseEvent, svg: SVGSVGElement | null): RowHover | null {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const y = e.clientY - rect.top;
  if (y < 0 || y >= ROW_H * 2) return null;
  return { x: e.clientX - rect.left, y, figW: rect.width, row: y < ROW_H ? 0 : 1 };
}

/** A two-bar panel for a measure where zero is the meaningful baseline. */
function BarPair({
  width,
  values,
  domainMax,
  format,
  describe,
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
  /** The hovered side's exact figures, counts included. One line. */
  describe: (row: 0 | 1) => string;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<RowHover | null>(null);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ maxWidth: "100%" }}
        role="img"
        onMouseMove={(e) => setHover(rowAt(e, svgRef.current))}
        onMouseLeave={() => setHover(null)}
      >
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

        {/* The row under the pointer, marked. Ink at low opacity, not the accent:
            this is emphasis, and the accent belongs to the data. */}
        {hover && (
          <rect
            x={padLeft}
            y={hover.row * ROW_H}
            width={inner}
            height={ROW_H}
            fill={ink}
            opacity={0.06}
          />
        )}

        <line x1={padLeft} x2={padLeft} y1={0} y2={ROW_H * 2} stroke={axis} strokeWidth={1} />
      </svg>

      {hover && (
        <LabTip
          x={hover.x}
          y={hover.y}
          figW={hover.figW}
          figH={height}
          title={SIDES[hover.row].label}
          detail={describe(hover.row)}
        />
      )}
    </div>
  );
}

export function TravelComparison({ stats }: { stats: TravelStats }) {
  const { tokens } = useTheme();
  const [ref, width] = useWidth(560, 300);
  const { travel, ordinary } = stats;
  const ratingRef = useRef<SVGSVGElement>(null);
  const [ratingHover, setRatingHover] = useState<RowHover | null>(null);

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
            describe={(row) => {
              const side = row === 0 ? travel : ordinary;
              return `${side.watches} watches over ${side.days} days`;
            }}
            ink={tokens.ink.primary}
            grid={tokens.ink.grid}
            axis={tokens.ink.axis}
            muted={tokens.ink.muted}
            mark={tokens.ink.mark}
          />
        </section>

        <section>
          <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
            Share of days viewing more than one film
          </h4>
          <p className="mt-0.5 mb-2 text-xs" style={{ color: tokens.ink.muted }}>
            {ratioLabel(stats.multiFilmRatio)} likelier. {travel.multiFilmDays} of {travel.days}{" "}
            against {ordinary.multiFilmDays} of {ordinary.days}.
          </p>
          <BarPair
            width={width}
            values={[travel.multiFilmShare * 100, ordinary.multiFilmShare * 100]}
            domainMax={80}
            format={(v) => `${Math.round(v)}%`}
            describe={(row) => {
              const side = row === 0 ? travel : ordinary;
              return `${side.multiFilmDays} of ${side.days} days`;
            }}
            ink={tokens.ink.primary}
            grid={tokens.ink.grid}
            axis={tokens.ink.axis}
            muted={tokens.ink.muted}
            mark={tokens.ink.mark}
          />
        </section>

        <section>
          <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
            Mean rating with 95% confidence intervals
          </h4>
          <p className="mt-0.5 mb-2 text-xs" style={{ color: tokens.ink.muted }}>
            {stats.ratingGapIsNoise ? "Unchanged" : "Changed"}. The two means differ by{" "}
            {signedLabel(stats.ratingDiff)} points over {travel.ratingN} watches, and the 95% CI on
            that gap runs {signedLabel(stats.ratingDiffCi[0])} to{" "}
            {signedLabel(stats.ratingDiffCi[1])}, so it
            {stats.ratingGapIsNoise ? " includes no change at all" : " excludes no change"}. Both
            medians are {travel.medianRating}.
          </p>
          <div className="relative">
            <svg
              ref={ratingRef}
              width={width}
              height={ratingH}
              style={{ maxWidth: "100%" }}
              role="img"
              onMouseMove={(e) => setRatingHover(rowAt(e, ratingRef.current))}
              onMouseLeave={() => setRatingHover(null)}
            >
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

              {ratingHover && (
                <rect
                  x={padLeft}
                  y={ratingHover.row * ROW_H}
                  width={inner}
                  height={ROW_H}
                  fill={tokens.ink.primary}
                  opacity={0.06}
                />
              )}

              {/* No left rule on this panel, unlike the two above. A vertical line
                  at the edge of a plot reads as the baseline, and this axis starts at
                  65 rather than zero, so a rule there would assert a zero the scale
                  does not have. The bar panels keep theirs because zero is genuinely
                  where their marks begin. */}
            </svg>

            {/* The interval spelled out, which is the one thing this panel draws
                that a reader cannot read off the axis: the whiskers overlap, and
                the numbers say by how much.

                EVERY STATISTIC HERE IS NAMED. Three bare numbers side by side
                read as one range with a middle, so "73.5 · 72.5 to 74.4 · median
                70" invites the question of how the median can sit outside the
                interval. It can because the interval belongs to the MEAN and
                nothing else: the ratings themselves run 20 to 100, and the mean
                sits above the median because more watches sit above 70 than
                below it. The words "mean" and "95% CI" are what stop the reader
                reading the pair as the spread of the data. */}
            {ratingHover && (
              <LabTip
                x={ratingHover.x}
                y={ratingHover.y}
                figW={ratingHover.figW}
                figH={ratingH}
                title={SIDES[ratingHover.row].label}
                detail={(() => {
                  const side = ratingHover.row === 0 ? travel : ordinary;
                  const half = ratingHover.row === 0 ? halfT : halfO;
                  return `mean ${ratingLabel(side.meanRating)} (95% CI ${ratingLabel(
                    side.meanRating - half,
                  )} to ${ratingLabel(side.meanRating + half)}) · median ${side.medianRating}`;
                })()}
              />
            )}
          </div>
          <p className="mt-2 text-xs" style={{ color: tokens.ink.muted }}>
            Each whisker is a 95% CI for that side&apos;s mean, not the spread of the ratings, so
            the dashed median tick can sit outside it. The axis does not start at zero, which is
            why these are intervals and not bars: a clipped bar exaggerates a gap this size and a
            zeroed one hides it. The interval shows how little {travel.ratingN} watches pin down.
          </p>
        </section>
      </div>
    </div>
  );
}
