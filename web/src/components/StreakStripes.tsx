"use client";

import { useMemo, useState } from "react";
import { interpolateRgb } from "d3";
import { useExplorer } from "@/lib/store";
import { DIVERGE_COOL, DIVERGE_MID, DIVERGE_WARM, INK } from "@/lib/palette";
import { computeMedianRating } from "@/lib/stats";
import type { EnrichedWatch } from "@/lib/types";

const W = 900;
const H = 130;
const ML = 16;
const MR = 16;
const MB = 22;

const WARM = DIVERGE_WARM;
const COOL = DIVERGE_COOL;
const MID = DIVERGE_MID;

const lerpToWarm = interpolateRgb(MID, WARM);
const lerpToCool = interpolateRgb(MID, COOL);

export function StreakStripes() {
  const { filtered, selectedId, setSelected } = useExplorer();
  const [hover, setHover] = useState<{ i: number; w: EnrichedWatch } | null>(null);

  const { rated, med, devMax } = useMemo(() => {
    const rated = filtered
      .filter((w) => w.rating != null)
      .sort((a, b) => a.d.getTime() - b.d.getTime());
    const med = computeMedianRating(filtered);
    let devMax = 10;
    if (med != null) for (const w of rated) devMax = Math.max(devMax, Math.abs((w.rating as number) - med));
    return { rated, med, devMax };
  }, [filtered]);

  if (rated.length === 0 || med == null) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-[#67655f]">
        No rated watches to plot.
      </div>
    );
  }

  const stripeW = (W - ML - MR) / rated.length;

  const yearStarts: { x: number; year: number }[] = [];
  const monthStarts: number[] = [];
  let lastYear = 0;
  let lastMonth = -1;
  rated.forEach((w, i) => {
    const y = w.d.getUTCFullYear();
    const m = w.d.getUTCMonth();
    if (y !== lastYear) {
      yearStarts.push({ x: ML + i * stripeW, year: y });
      lastYear = y;
      lastMonth = m;
    } else if (m !== lastMonth) {
      monthStarts.push(ML + i * stripeW);
      lastMonth = m;
    }
  });

  const colorOf = (rating: number) => {
    const t = Math.max(-1, Math.min(1, (rating - med) / devMax));
    return t < 0 ? lerpToCool(-t) : lerpToWarm(t);
  };

  const hasSel = selectedId != null;

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="One stripe per rated watch in order, coloured by how far the rating sat above or below my median"
      >
        {rated.map((w, i) => {
          const sel = hasSel && w.tmdb_id === selectedId;
          return (
            <rect
              key={`${w.tmdb_id}-${w.date}-${i}`}
              x={ML + i * stripeW}
              y={8}
              width={stripeW + 0.3}
              height={H - MB - 8}
              fill={colorOf(w.rating as number)}
              opacity={hasSel && !sel ? 0.3 : 1}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover({ i, w })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSelected(w.tmdb_id)}
            />
          );
        })}
        {/* Unlabelled month ticks under the block; year starts get the label. */}
        {monthStarts.map((x, i) => (
          <line key={`m-${i}`} x1={x} y1={H - MB} x2={x} y2={H - MB + 3} stroke={INK.grid} strokeWidth={0.75} />
        ))}
        {yearStarts.map(({ x, year }) => (
          <g key={year}>
            <line x1={x} y1={8} x2={x} y2={H - MB + 2} stroke={INK.surface} strokeWidth={1} />
            <line x1={x} y1={H - MB} x2={x} y2={H - MB + 5} stroke={INK.axis} strokeWidth={1} />
            <text x={x + 2} y={H - 6} fill={INK.muted} fontSize={10} textAnchor="start">
              {year}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: INK.muted }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4" style={{ background: WARM }} /> above my median ({Math.round(med)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4" style={{ background: MID, outline: `1px solid ${INK.grid}` }} /> at par
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4" style={{ background: COOL }} /> below
        </span>
      </figcaption>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${Math.min(88, Math.max(8, ((ML + hover.i * stripeW) / W) * 100))}%`,
            top: 0,
            transform: "translate(-50%, -110%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <span className="font-medium">{hover.w.film?.title ?? hover.w.tmdb_id}</span>
          <span style={{ color: "#c3c2b7" }}>
            {" "}
            · {hover.w.d.toISOString().slice(0, 10)} · {Math.round(hover.w.rating as number)} (
            {(hover.w.rating as number) >= med ? "+" : ""}
            {Math.round((hover.w.rating as number) - med)} vs median)
          </span>
        </div>
      )}
    </figure>
  );
}
