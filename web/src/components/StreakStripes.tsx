"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { computeAvgRating } from "@/lib/stats";
import type { EnrichedWatch } from "@/lib/types";

const W = 900;
const H = 130;
const ML = 16;
const MR = 16;
const MB = 22;

// Diverging: crimson = above my average, blue = below, pale = at par.
// Poles reuse the palette's validated crimson/blue; the midpoint is a neutral
// tint of the paper surface so "we agree" recedes.
const WARM = "#c01023";
const COOL = "#2a78d6";
const MID = "#eceae3";

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function StreakStripes() {
  const { filtered, selectedId, setSelected } = useExplorer();
  const [hover, setHover] = useState<{ i: number; w: EnrichedWatch } | null>(null);

  const { rated, avg, devMax } = useMemo(() => {
    const rated = filtered
      .filter((w) => w.rating != null)
      .sort((a, b) => a.d.getTime() - b.d.getTime());
    const avg = computeAvgRating(filtered).mean;
    let devMax = 10;
    if (avg != null) for (const w of rated) devMax = Math.max(devMax, Math.abs((w.rating as number) - avg));
    return { rated, avg, devMax };
  }, [filtered]);

  if (rated.length === 0 || avg == null) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-[#67655f]">
        No rated watches to plot.
      </div>
    );
  }

  const stripeW = (W - ML - MR) / rated.length;

  const yearStarts: { x: number; year: number }[] = [];
  let lastYear = 0;
  rated.forEach((w, i) => {
    const y = w.d.getUTCFullYear();
    if (y !== lastYear) {
      yearStarts.push({ x: ML + i * stripeW, year: y });
      lastYear = y;
    }
  });

  const colorOf = (rating: number) => {
    const t = Math.max(-1, Math.min(1, (rating - avg) / devMax));
    return t < 0 ? hexLerp(MID, COOL, -t) : hexLerp(MID, WARM, t);
  };

  const hasSel = selectedId != null;

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="One stripe per rated watch in order, coloured by how far the rating sat above or below my average"
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
        {yearStarts.map(({ x, year }) => (
          <g key={year}>
            <line x1={x} y1={8} x2={x} y2={H - MB + 2} stroke={INK.surface} strokeWidth={1} />
            <text x={x + 2} y={H - 6} fill={INK.muted} fontSize={10} textAnchor="start">
              {year}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: INK.muted }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4" style={{ background: WARM }} /> above my average ({Math.round(avg)})
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
            {(hover.w.rating as number) >= avg ? "+" : ""}
            {Math.round((hover.w.rating as number) - avg)} vs avg)
          </span>
        </div>
      )}
    </figure>
  );
}
