"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { hasKnownRewatchState, insetRect, NO_DATA_STROKE, quantile } from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { useWidth } from "@/lib/useWidth";
import { accentFor, isPicked, pickWatches } from "./pick";
import { Toggle } from "./Toggle";

type Grain = "week" | "month" | "year";
type Kind = "all" | "first" | "rewatch";
const GRAINS = ["week", "month", "year"] as const;
const KINDS = ["all", "first", "rewatch"] as const;

const W0 = 720;
// Weekly grain draws one bar per week over eight years, so extra width buys
// real resolution here rather than just air.
const W_MIN = 320;
const H = 170;
// Wide enough for the "median 7" tick label. At 30 it rendered as "edian 7":
// the text is right-anchored at ML - 4, so a label wider than that runs off the
// left edge of the SVG rather than pushing the plot over.
const ML = 44;
const MB = 16;

/** Bucket key for a date at the chosen grain. Weeks are ISO-ish: Monday start. */
function bucketKey(date: string, grain: Grain): string {
  if (grain === "year") return date.slice(0, 4);
  if (grain === "month") return date.slice(0, 7);
  const d = new Date(date + "T00:00:00Z");
  // Back up to the Monday, so a week is a week rather than a 7-day offset from
  // whenever the data happens to start.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Every bucket from the first watch to the last, with no gaps. */
function bucketSpan(dates: string[], grain: Grain): string[] {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const last = bucketKey(sorted[sorted.length - 1], grain);
  const seed = bucketKey(sorted[0], grain);
  const suffix = grain === "year" ? "-01-01" : grain === "month" ? "-01" : "";
  const cur = new Date(seed + suffix + "T00:00:00Z");
  const out: string[] = [];
  for (let guard = 0; guard < 5000; guard++) {
    const key =
      grain === "year"
        ? cur.toISOString().slice(0, 4)
        : grain === "month"
          ? cur.toISOString().slice(0, 7)
          : cur.toISOString().slice(0, 10);
    out.push(key);
    if (key >= last) break;
    if (grain === "year") cur.setUTCFullYear(cur.getUTCFullYear() + 1);
    else if (grain === "month") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}

/**
 * Viewing pace over time.
 *
 * One bar per bucket, no smoothing. A trailing mean has to pick a window and the
 * window is a claim; a calendar unit is a real one, so nothing here needs
 * justifying and each bar is exactly what happened.
 *
 * Colored like the pace charts rather than split by genre: one chrome-gray
 * series that takes the accent when a bucket is picked. A genre split was
 * tried and cut, because at monthly grain most segments were one or two films
 * tall and the composition it claimed to show was below the resolution of the
 * bar. The cumulative chart carries the genre mix, where the bands are thick
 * enough to read.
 *
 * Under first or rewatch the sheet-era months cannot be classified at all (D5),
 * so they drop out of the count and are drawn as the outlined "not recorded"
 * band instead of silently reading as zero.
 */
export function ViewingVelocity() {
  const { all, filtered, filters, setSelection } = useExplorer();
  const { tokens } = useTheme();
  const FADE = tokens.ink.grid;
  const MID = tokens.surface.well;
  const [grain, setGrain] = useState<Grain>("month");
  const [kind, setKind] = useState<Kind>("all");
  const [ref, W] = useWidth(W0, W_MIN);
  const accent = accentFor(filters.genres, tokens);

  const model = useMemo(() => {
    // The axis spans the FULL history so the chart keeps its shape under a
    // filter: a filtered-out bucket should read as an empty column, not vanish
    // and slide every later one leftward.
    const keys = bucketSpan(
      all.map((w) => w.date),
      grain,
    );
    const idx = new Map(keys.map((k, i) => [k, i]));
    const counted: EnrichedWatch[][] = keys.map(() => []);
    const unknown: EnrichedWatch[][] = keys.map(() => []);
    for (const w of filtered) {
      const i = idx.get(bucketKey(w.date, grain));
      if (i == null) continue;
      if (kind !== "all" && !hasKnownRewatchState(w)) {
        unknown[i].push(w);
        continue;
      }
      if (kind === "first" && w.rewatch) continue;
      if (kind === "rewatch" && !w.rewatch) continue;
      counted[i].push(w);
    }
    return { keys, counted, unknown };
  }, [all, filtered, grain, kind]);

  const { keys, counted, unknown } = model;
  if (!keys.length) return null;

  const totals = keys.map((_, i) => counted[i].length + unknown[i].length);
  const peak = Math.max(...totals, 1);
  // Median over buckets that actually had something: including the empty ones
  // would report the median as zero for any sparse filter, which describes the
  // axis rather than the viewing.
  const live = totals.filter((v) => v > 0).sort((a, b) => a - b);
  const median = live.length ? quantile(live, 0.5) : 0;

  const step = (W - ML) / keys.length;
  const h = (n: number) => (n / peak) * (H - MB - 10);
  const base = H - MB;
  const y = (v: number) => base - h(v);

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Toggle options={GRAINS} value={grain} onChange={setGrain} label="Bucket size" />
        <Toggle options={KINDS} value={kind} onChange={setKind} label="Which watches" />
      </div>
      <svg width={W} height={H} role="img" style={{ maxWidth: "100%" }}>
        {[
          { v: peak, label: `${peak}` },
          { v: median, label: `median ${median.toFixed(median % 1 ? 1 : 0)}` },
        ].map((t, i) => (
          <g key={i}>
            <line
              x1={ML}
              y1={y(t.v)}
              x2={W}
              y2={y(t.v)}
              stroke={i === 0 ? tokens.ink.grid : tokens.ink.muted}
              strokeOpacity={i === 0 ? 0.4 : undefined}
              strokeDasharray={i === 0 ? undefined : "4 3"}
            />
            <text x={ML - 4} y={y(t.v) + 3} textAnchor="end" fontSize={8} fill={tokens.ink.muted}>
              {t.label}
            </text>
          </g>
        ))}

        {keys.map((k, i) => {
          const c = counted[i];
          const u = unknown[i];
          const x = ML + i * step;
          const wpx = Math.max(step - 0.6, 0.7);
          const hU = h(u.length);
          const picked = isPicked(c, filters.selection);
          const ins = NO_DATA_STROKE / 2;
          // The unrecorded run is traced as a staircase off the bars' own edges:
          // outlining each bar as a box put strokes down both sides of every gap
          // and filled them into a solid block.
          const hPrev = h(unknown[i - 1]?.length ?? 0);
          const hNext = h(unknown[i + 1]?.length ?? 0);
          return (
            <g key={k}>
              {u.length > 0 && (
                <>
                  <rect {...insetRect(x, base - hU, wpx, hU)} fill={MID} stroke="none" />
                  <line
                    x1={x}
                    y1={base - hU + ins}
                    x2={x + wpx}
                    y2={base - hU + ins}
                    stroke={tokens.ink.primary}
                    strokeWidth={NO_DATA_STROKE}
                  />
                  {hU > hPrev && (
                    <line
                      x1={x + ins}
                      y1={base - hU}
                      x2={x + ins}
                      y2={base - hPrev}
                      stroke={tokens.ink.primary}
                      strokeWidth={NO_DATA_STROKE}
                    />
                  )}
                  {hU > hNext && (
                    <line
                      x1={x + wpx - ins}
                      y1={base - hU}
                      x2={x + wpx - ins}
                      y2={base - hNext}
                      stroke={tokens.ink.primary}
                      strokeWidth={NO_DATA_STROKE}
                    />
                  )}
                </>
              )}
              <rect
                x={x}
                y={base - hU - h(c.length)}
                width={wpx}
                height={h(c.length)}
                fill={picked ? accent : FADE}
              />
              <rect
                x={x}
                y={0}
                width={Math.max(step, 1)}
                height={base}
                fill={picked ? accent : "transparent"}
                fillOpacity={picked ? 0.12 : 1}
                style={{ cursor: "pointer" }}
                onClick={() => pickWatches(c, filters.selection, setSelection)}
              />
            </g>
          );
        })}

        {/* Year label at the first bucket of each year, whatever the grain. */}
        {keys.map((k, i) =>
          i === 0 || k.slice(0, 4) !== keys[i - 1].slice(0, 4) ? (
            <text
              key={k}
              x={ML + i * step}
              y={H - 3}
              fontSize={8}
              fill={tokens.ink.muted}
              pointerEvents="none"
            >
              {k.slice(0, 4)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
