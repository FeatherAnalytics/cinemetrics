"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import {
  ceilTo,
  chicagoParts,
  dayOfYearFixed,
  LEAP_OFFSETS,
  lerpHex,
  MONTH_ABBR,
  ticksEvery,
  YEAR_SLOTS,
} from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { useWidth } from "@/lib/useWidth";
import { isPicked, pickWatches } from "./pick";

const W0 = 720;
// Floored higher than the other plots: the right margin is a fixed-width table,
// so the plot itself is what a narrow column eats into.
const W_MIN = 380;
const H = 250;
const ML = 34;
// Wide enough for "2020 146"; at 40 the labels clipped.
const MR = 62;
const MB = 22;
const FADE = "#b3b1a6";

/**
 * Watches accumulated so far within each calendar year, one line per year.
 *
 * Restarts at zero every January, so the question is "am I ahead of last year at
 * this point?" rather than "how much in total". That is the axis the cumulative
 * chart does not have: it stacks across the whole history and never lets two
 * years be compared at the same point in their own cycle.
 *
 * Lines stop at each year's last watch rather than running flat to December, so
 * the current part-year reads as incomplete rather than as a collapse.
 */
export function ViewingsToDate() {
  const { filtered, filters, setSelection } = useExplorer();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth(W0, W_MIN);

  const years = useMemo(() => {
    const daily = new Map<number, number[]>();
    const watches = new Map<number, EnrichedWatch[]>();
    const last = new Map<number, number>();
    for (const w of filtered) {
      const { month, year } = chicagoParts(w.date);
      const i = dayOfYearFixed(month, Number(w.date.slice(8, 10)));
      const arr = daily.get(year) ?? (Array(YEAR_SLOTS).fill(0) as number[]);
      arr[i] += 1;
      daily.set(year, arr);
      watches.set(year, [...(watches.get(year) ?? []), w]);
      last.set(year, Math.max(last.get(year) ?? -1, i));
    }
    return [...daily.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, days]) => {
        const stop = last.get(year) ?? -1;
        let run = 0;
        const cum = days.map((v, i) => {
          run += v;
          return i <= stop ? run : null;
        });
        return { year, cum, watches: watches.get(year) ?? [] };
      });
  }, [filtered]);

  if (!years.length) return null;

  const peak = Math.max(...years.flatMap((y) => y.cum.map((v) => v ?? 0)), 1);
  const TICK_STEP = 50;
  const scaleMax = Math.max(ceilTo(peak, TICK_STEP), TICK_STEP);
  const x = (i: number) => ML + (i / (YEAR_SLOTS - 1)) * (W - ML - MR);
  const y = (v: number) => H - MB - (v / scaleMax) * (H - MB - 12);

  const newest = Math.max(...years.map((y) => y.year));
  const oldest = Math.min(...years.map((y) => y.year));
  // Recency ramp on the house crimson-to-chrome scale, never a genre color, so a
  // year cannot read as a genre.
  const tint = (year: number) =>
    lerpHex(ACCENT, FADE, newest === oldest ? 0 : (newest - year) / (newest - oldest));

  /**
   * The right margin is a TABLE, not a scatter of annotations.
   *
   * Rows are evenly spaced rather than parked at each line's endpoint, so the eye
   * can run straight down them; irregular gaps made scanning a series of small
   * vertical jumps.
   *
   * Year and count are separate text elements at fixed x, the count right
   * aligned. One `{year} {count}` string would let a proportional font shift the
   * count left and right by row, which is the same scanning problem one level
   * down.
   *
   * Rows RESORT as the cursor moves, highest first, so the margin reads as a
   * standings table: drag across the year and watch the order change hands.
   *
   * A year whose data has run out holds its last value rather than dropping to a
   * dash, which is the "if I watched nothing else this year" reading. Without it
   * the current year would vanish from the table the moment the cursor passed
   * today, exactly when comparing it to the others is most interesting.
   */
  const ROW_H = 13;
  const LABEL_X = W - MR + 6;
  const COUNT_RIGHT = W - 2;
  const labels = years
    .map((s) => {
      let stop = -1;
      for (let i = 0; i < s.cum.length; i++) if (s.cum[i] != null) stop = i;
      if (stop < 0) return null;
      const shown = hover == null ? s.cum[stop]! : s.cum[Math.min(hover, stop)]!;
      return { year: s.year, shown, watches: s.watches, partial: hover != null && hover > stop };
    })
    .filter((l): l is NonNullable<typeof l> => l != null)
    .sort((a, b) => b.shown - a.shown || b.year - a.year)
    .map((l, i) => ({ ...l, y: 12 + i * ROW_H }));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < ML || px > W - MR) return setHover(null);
    const i = Math.round(((px - ML) / (W - ML - MR)) * (YEAR_SLOTS - 1));
    setHover(Math.min(YEAR_SLOTS - 1, Math.max(0, i)));
  };

  const hoverLabel = (() => {
    if (hover == null) return "year end";
    let m = 0;
    for (let i = 0; i < LEAP_OFFSETS.length; i++) if (hover >= LEAP_OFFSETS[i]) m = i;
    return `${MONTH_ABBR[m]} ${hover - LEAP_OFFSETS[m] + 1}`;
  })();

  return (
    <div ref={ref}>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        watches to <span style={{ color: INK.primary }}>{hoverLabel}</span>
      </div>
      <svg
        width={W}
        height={H}
        role="img"
        style={{ maxWidth: "100%" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticksEvery(scaleMax, TICK_STEP).map((v) => (
          <g key={v}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke="#eee" />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
              {v}
            </text>
          </g>
        ))}
        {LEAP_OFFSETS.map((off, m) => (
          <text key={m} x={x(off)} y={H - 6} textAnchor="start" fontSize={8} fill={INK.muted}>
            {MONTH_ABBR[m]}
          </text>
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            y1={0}
            x2={x(hover)}
            y2={H - MB}
            stroke={INK.primary}
            strokeWidth={0.75}
            pointerEvents="none"
          />
        )}

        {years.map((s) => {
          const pts: string[] = [];
          for (let i = 0; i < s.cum.length; i++) {
            const v = s.cum[i];
            if (v == null) continue;
            pts.push(`${pts.length === 0 ? "M" : "L"}${x(i)},${y(v)}`);
          }
          if (!pts.length) return null;
          return (
            <path
              key={s.year}
              d={pts.join(" ")}
              fill="none"
              stroke={tint(s.year)}
              strokeWidth={isPicked(s.watches, filters.selection) ? 3 : 1.5}
            />
          );
        })}

        {labels.map((l) => {
          const on = isPicked(l.watches, filters.selection);
          const color = on ? ACCENT : tint(l.year);
          return (
            <g
              key={l.year}
              style={{ cursor: "pointer" }}
              onClick={() => pickWatches(l.watches, filters.selection, setSelection)}
            >
              <rect
                x={LABEL_X - 3}
                y={l.y - ROW_H + 3}
                width={W - LABEL_X + 3}
                height={ROW_H}
                fill="transparent"
              />
              <text x={LABEL_X} y={l.y} fontSize={9} fontWeight={700} fill={color}>
                {l.year}
              </text>
              <text
                x={COUNT_RIGHT}
                y={l.y}
                textAnchor="end"
                fontSize={9}
                fontWeight={700}
                fill={color}
                // A year that has run out of data is holding its final value
                // rather than still counting, so it reads at lower contrast: the
                // number is real but it is not a same-date comparison any more.
                fillOpacity={l.partial ? 0.5 : 1}
              >
                {l.shown}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
