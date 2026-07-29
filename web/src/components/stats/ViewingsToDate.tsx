"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
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
import { accentFor, isPicked, pickWatches } from "./pick";

const W0 = 720;
const W_MIN = 380;
const H = 250;
const ML = 34;
// The standings table used to live in a 62px right margin, which cost the plot
// a tenth of its width and pushed the month axis out of alignment with the pace
// chart directly above. It is now an overlay inside the plot's own top-left,
// where the curves are always near zero and the space is dead anyway.
const MR = 12;
const MB = 22;

// Standings overlay geometry, in plot coordinates.
const LEG_X = 6; // inset from the y-axis
const LEG_Y = 4;
const LEG_ROW = 12;
const LEG_YEAR_W = 26; // "2020"
const LEG_BAR_W = 46; // the mini bar track
const LEG_VAL_W = 26; // the count, right aligned

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
  const { tokens } = useTheme();
  const FADE = tokens.ink.grid;
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth(W0, W_MIN);
  const accent = accentFor(filters.genres, tokens);

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
  // The tick step follows the data instead of being pinned at 50. Filtered to a
  // 25-watch genre the busiest year reaches 8, and a fixed 50-step axis put the
  // whole chart in the bottom sixth of its own plot with five empty gridlines
  // above it. Steps stay round so the labels are still numbers a reader can do
  // arithmetic with.
  const TICK_STEP = peak <= 10 ? 2 : peak <= 25 ? 5 : peak <= 60 ? 10 : 50;
  const scaleMax = Math.max(ceilTo(peak, TICK_STEP), TICK_STEP);
  const x = (i: number) => ML + (i / (YEAR_SLOTS - 1)) * (W - ML - MR);
  const y = (v: number) => H - MB - (v / scaleMax) * (H - MB - 12);

  const newest = Math.max(...years.map((y) => y.year));
  const oldest = Math.min(...years.map((y) => y.year));
  // Recency ramp on the house crimson-to-chrome scale, never a genre color, so a
  // year cannot read as a genre.
  const tint = (year: number) =>
    lerpHex(accent, FADE, newest === oldest ? 0 : (newest - year) / (newest - oldest));

  /**
   * A STANDINGS TABLE overlaid on the plot's top-left, not a scatter of
   * annotations in a margin.
   *
   * Rows are evenly spaced rather than parked at each line's endpoint, so the
   * eye can run straight down them; irregular gaps made scanning a series of
   * small vertical jumps.
   *
   * Year, bar and count are separate elements at fixed x. One `{year} {count}`
   * string would let a proportional font shift the count around by row, which
   * is the same scanning problem one level down. The bar is what makes the
   * table readable at a glance: seven right-aligned numbers are a list, seven
   * bars are a ranking, and it is the ranking that changes hands mid-year.
   *
   * Rows RESORT as the cursor moves, highest first.
   *
   * A year whose data has run out holds its last value rather than dropping to a
   * dash, which is the "if I watched nothing else this year" reading. Without it
   * the current year would vanish from the table the moment the cursor passed
   * today, exactly when comparing it to the others is most interesting.
   */
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
    .map((l, i) => ({ ...l, y: LEG_Y + 8 + i * LEG_ROW }));

  // Bars scale to the leader at the hovered date, so the top bar is always full
  // width and the rest read as a share of it.
  const legMax = Math.max(...labels.map((l) => l.shown), 1);
  const legX = ML + LEG_X;

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
        style={{ color: tokens.ink.muted }}
      >
        watches to <span style={{ color: tokens.ink.primary }}>{hoverLabel}</span>
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
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={tokens.ink.grid} strokeOpacity={0.4} />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={tokens.ink.muted}>
              {v}
            </text>
          </g>
        ))}
        {LEAP_OFFSETS.map((off, m) => (
          <text key={m} x={x(off)} y={H - 6} textAnchor="start" fontSize={8} fill={tokens.ink.muted}>
            {MONTH_ABBR[m]}
          </text>
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            y1={0}
            x2={x(hover)}
            y2={H - MB}
            stroke={tokens.ink.primary}
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
          const color = on ? accent : tint(l.year);
          const barLen = (l.shown / legMax) * LEG_BAR_W;
          return (
            <g
              key={l.year}
              style={{ cursor: "pointer" }}
              onClick={() => pickWatches(l.watches, filters.selection, setSelection)}
            >
              <rect
                x={legX - 3}
                y={l.y - LEG_ROW + 3}
                width={LEG_YEAR_W + LEG_BAR_W + LEG_VAL_W + 12}
                height={LEG_ROW}
                fill="transparent"
              />
              <text x={legX} y={l.y} fontSize={9} fontWeight={700} fill={color}>
                {l.year}
              </text>
              {/* The mini bar is the same object as this year's line, in the
                  same recency tint, so the table and the plot cannot disagree
                  about which year is which. */}
              <rect
                x={legX + LEG_YEAR_W}
                y={l.y - 7}
                width={Math.max(barLen, 0.5)}
                height={8}
                fill={color}
                fillOpacity={l.partial ? 0.4 : 0.85}
              />
              <text
                x={legX + LEG_YEAR_W + LEG_BAR_W + LEG_VAL_W}
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
