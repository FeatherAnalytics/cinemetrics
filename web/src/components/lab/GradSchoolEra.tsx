"use client";

import { hairline, useTheme } from "@/lib/theme";
import { useWidth } from "@/lib/useWidth";
import { fmt1 } from "@/lib/format";
import { GRAD_SCHOOL, monthLabel, TREND_WINDOW, type EraStats } from "@/lib/gradSchool";

/**
 * The years I was in school, marked on a chronological strip.
 *
 * The swim lane cannot host this. It wraps the log into one lane per year, so a
 * span running from August of one year to May of another would be drawn as two
 * disconnected pieces on two rows, which is the opposite of what a span is for.
 * A bracket needs an unbroken time axis, so the strip is its own small chart.
 *
 * Two bands under one x axis, each answering one question:
 *
 * - The line is the trailing mean rating, so the reader can see WHEN the ratings
 *   moved. This is the band the caveat lives on, because the climb visibly
 *   predates the bracket.
 * - The rug under it is one tick per watch, so the reader can see the pace. The
 *   span is the thinner stretch, which is the direction people do not expect.
 *
 * Individual ratings are deliberately not plotted. 795 dots across a 0 to 100
 * axis would flatten the trend line into a nearly straight one, and the claim on
 * this page is about the mean and not about any single watch.
 *
 * No accent anywhere. Crimson is genre identity, the diverging ramp and the
 * heart, and an era band is chrome.
 */

const H = 196;
const ML = 30;
const MR = 12;
/** Room above the plot for the bracket and its label. */
const MT = 34;
const MB = 20;
/** The rug's own strip, between the plot floor and the year axis. */
const RUG_H = 16;

/** A rating axis rounded out to whole fives, so its ticks are readable numbers. */
function niceDomain(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return [Math.floor((lo - 1) / 5) * 5, Math.ceil((hi + 1) / 5) * 5];
}

export function GradSchoolEra({ stats }: { stats: EraStats }) {
  const { tokens } = useTheme();
  const [ref, w] = useWidth(720, 320);

  const t0 = Date.parse(stats.logStart);
  const t1 = Date.parse(stats.logEnd);
  const plotW = Math.max(1, w - ML - MR);
  const plotH = H - MT - MB - RUG_H;
  const x = (iso: string) => ML + ((Date.parse(iso) - t0) / (t1 - t0)) * plotW;

  const [lo, hi] = niceDomain(stats.trend.map((p) => p.mean));
  const y = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * plotH;

  const bandX0 = x(GRAD_SCHOOL.start);
  const bandX1 = x(GRAD_SCHOOL.end);
  const rugTop = MT + plotH + 4;

  const line = stats.trend
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.mean).toFixed(1)}`)
    .join("");

  // One tick per whole year the log reaches into.
  const years: number[] = [];
  const lastYear = new Date(t1).getUTCFullYear();
  for (let yr = new Date(t0).getUTCFullYear(); yr <= lastYear; yr++) years.push(yr);

  const [early, before, inside, after] = stats.neighbors;

  // Looked up rather than written into the sentence. Both of these are claims
  // about where a turn happens, and a hardcoded year or month would go on being
  // asserted after the data stopped supporting it.
  const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
  const busiestBoundary = stats.boundaryMonths.reduce((a, b) => (b.watches > a.watches ? b : a));
  const boundaryPeakPrecedes = busiestBoundary.month < GRAD_SCHOOL.start.slice(0, 7);

  return (
    <div>
      <div ref={ref} style={{ maxWidth: "100%" }}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label="Watch dates and trailing mean rating, with the grad school span bracketed"
        >
          {/* The band, drawn behind everything. A wash and a pair of end rules
              rather than a filled block: the span is a label on the axis, not a
              category the marks belong to, and a solid fill would read as one. */}
          <rect
            x={bandX0}
            y={MT - 12}
            width={bandX1 - bandX0}
            height={plotH + 12 + RUG_H + 4}
            fill={hairline(tokens.ink.primary, 7)}
          />
          {[bandX0, bandX1].map((bx) => (
            <line
              key={bx}
              x1={bx}
              y1={MT - 12}
              x2={bx}
              y2={MT + plotH + RUG_H + 4}
              stroke={tokens.ink.axis}
              strokeWidth={1}
            />
          ))}
          {/* The bracket proper: a rule with the two end stops, above the plot so
              it reads as an annotation on time rather than a mark in the data. */}
          <line
            x1={bandX0}
            y1={MT - 12}
            x2={bandX1}
            y2={MT - 12}
            stroke={tokens.ink.secondary}
            strokeWidth={1.5}
          />
          <text
            x={(bandX0 + bandX1) / 2}
            y={MT - 18}
            textAnchor="middle"
            fontSize={11}
            fill={tokens.ink.secondary}
          >
            in school, {monthLabel(GRAD_SCHOOL.start)} to {monthLabel(GRAD_SCHOOL.end)}
          </text>

          {/* Rating gridlines. Two, at the ends of the domain, because a trailing
              mean is read as a level and three more rules would be scaffolding. */}
          {[lo, hi].map((v) => (
            <g key={v}>
              <line
                x1={ML}
                y1={y(v)}
                x2={ML + plotW}
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
            d={line}
            fill="none"
            stroke={tokens.ink.primary}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {/* The rug: every watch, on its own date. Ticks overlap heavily in a busy
              month, which is the point of drawing them rather than binning them
              into a bar per month that would need its own axis. */}
          {stats.points.map((p, i) => (
            <line
              key={i}
              x1={x(p.date)}
              y1={rugTop}
              x2={x(p.date)}
              y2={rugTop + RUG_H - 6}
              stroke={tokens.ink.mark}
              strokeWidth={0.75}
              strokeOpacity={0.45}
            />
          ))}

          <line
            x1={ML}
            y1={rugTop + RUG_H - 4}
            x2={ML + plotW}
            y2={rugTop + RUG_H - 4}
            stroke={tokens.ink.axis}
            strokeWidth={0.5}
          />
          {years.map((yr) => (
            <text
              key={yr}
              x={x(`${yr}-01-01` < stats.logStart ? stats.logStart : `${yr}-01-01`)}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill={tokens.ink.muted}
              className="tabular-nums"
            >
              {yr}
            </text>
          ))}
        </svg>
      </div>

      <p className="mt-1 text-[11px]" style={{ color: tokens.ink.muted }}>
        Line: trailing mean rating over {TREND_WINDOW} watches. Ticks: one per watch.
      </p>

      {/* The four figures, both sides, so no number is quoted without its
          baseline. Percent-free and unrounded past one decimal, because the
          in-span side rests on 169 watches. */}
      <table className="mt-5 w-full max-w-md text-sm">
        <thead>
          <tr style={{ color: tokens.ink.muted }}>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">In school</th>
            <th className="py-1 text-right font-normal">Outside it</th>
          </tr>
        </thead>
        <tbody className="tabular-nums" style={{ color: tokens.ink.primary }}>
          {[
            ["Days", String(stats.inSpan.days), String(stats.outside.days)],
            ["Watches", String(stats.inSpan.watches), String(stats.outside.watches)],
            ["Per 30 days", fmt1(stats.inSpan.per30), fmt1(stats.outside.per30)],
            ["Mean rating", fmt1(stats.inSpan.meanRating), fmt1(stats.outside.meanRating)],
          ].map(([label, a, b]) => (
            <tr key={label} style={{ borderTop: `1px solid ${tokens.ink.grid}` }}>
              <td className="py-1" style={{ color: tokens.ink.secondary }}>
                {label}
              </td>
              <td className="py-1 text-right">{a}</td>
              <td className="py-1 text-right">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-5 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
        {stats.ratingGapIsNoise ? (
          <>
            The gap between the two mean ratings is {fmt1(stats.ratingDiff)} points on{" "}
            {stats.inSpan.ratingN} watches, inside its own interval, so there is nothing here to
            read.
          </>
        ) : (
          <>
            I rated {fmt1(stats.ratingDiff)} points higher in school than out of it,{" "}
            {fmt1(Math.abs(stats.ratingDiffZ))} standard errors on {stats.inSpan.ratingN} watches.
            Unlike the travel gap, that is too large to be chance. I also watched less: {""}
            {fmt1(stats.inSpan.per30)} films per 30 days against {fmt1(stats.outside.per30)}.
          </>
        )}
      </p>

      {/* The caveat, and it is the more important half of the section. The figure
          above is real and its obvious reading is wrong, so the four windows are
          rendered rather than described: a reader who only skims the table should
          still be unable to miss that the level was already up before the
          bracket opens. */}
      <div className="mt-6 border-t pt-4" style={{ borderColor: tokens.ink.grid }}>
        <p className="max-w-2xl text-sm font-bold" style={{ color: tokens.ink.primary }}>
          What this does not show is a cause.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          My ratings have been climbing since {trough.year}, and the climb starts years before
          the bracket opens. The yearly means run{" "}
          {stats.yearlyMeans.map((m) => fmt1(m.mean)).join(", ")}, so most of the rise had already
          happened by {monthLabel(GRAD_SCHOOL.start)}. Cut the log into the span and the stretches
          on either side of it and the level barely moves: {fmt1(before.meanRating)} in the twelve
          months before, {fmt1(inside.meanRating)} inside, {fmt1(after.meanRating)} in the twelve
          months after. The {fmt1(stats.ratingDiff)} point gap is almost entirely the early years,
          which are {early.watches} of the {stats.outside.watches} watches on the outside at a mean
          of {fmt1(early.meanRating)}.
        </p>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          The pace has no boundary either. The months around the start date run{" "}
          {stats.boundaryMonths.map((m) => m.watches).join(", ")} watches, and the busiest of them
          is {boundaryPeakPrecedes ? "before school began" : "inside the span"}. So: this is when I
          was in school, and this is what the numbers do inside it. It is not evidence that school
          did it.
        </p>
      </div>
    </div>
  );
}
