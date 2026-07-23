"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import type { EnrichedWatch } from "@/lib/types";
import { ChartTakeaway } from "./ChartTakeaway";

const MARGIN_LEFT = 55;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 30;
const MARGIN_RIGHT = 10;
const LANE_H = 70;
const BASE_WIDTH = 720;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Pt = { w: EnrichedWatch; x: number; y: number; color: string; op: number; r: number; sel: boolean };

export function SwimLaneChart() {
  const { all, filtered, yearBounds, selectedId, setSelected, setSelection, storyResult } =
    useExplorer();
  const [hover, setHover] = useState<{ x: number; y: number; w: EnrichedWatch } | null>(null);
  const monthFocus = storyResult?.monthFocus ?? null;

  const [startYear, endYear] = yearBounds;
  const nYears = Math.max(1, endYear - startYear + 1);
  const CHART_WIDTH = BASE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const viewBoxHeight = MARGIN_TOP + nYears * LANE_H + MARGIN_BOTTOM;

  const place = (w: EnrichedWatch): { x: number; y: number } => {
    const yearIndex = w.d.getUTCFullYear() - startYear;
    const laneTop = MARGIN_TOP + yearIndex * LANE_H;
    const x = MARGIN_LEFT + w.yearFrac * CHART_WIDTH;
    const rating = w.rating ?? 70;
    const y = laneTop + (1 - rating / 100) * LANE_H;
    return { x, y };
  };

  const filteredSet = new Set(filtered.map(watchKey));
  const ghosts = all.filter((w) => !filteredSet.has(watchKey(w)));
  const hasSel = selectedId != null;

  // Seasonal finding: how horror-heavy October runs vs the rest of the year.
  const octoberHorror = useMemo(() => {
    let octTotal = 0;
    let octHorror = 0;
    for (const w of filtered) {
      if (w.d.getUTCMonth() !== 9) continue;
      octTotal += 1;
      if (primaryGenre(w.film) === "Horror") octHorror += 1;
    }
    if (octTotal < 15) return null;
    return Math.round((octHorror / octTotal) * 100);
  }, [filtered]);

  const points: Pt[] = [];

  // Ghosts first
  for (const w of ghosts) {
    const { x, y } = place(w);
    points.push({ w, x, y, color: INK.muted, op: 0.08, r: 3.5, sel: false });
  }

  // Active dots
  for (const w of filtered) {
    const { x, y } = place(w);
    const sel = hasSel && w.tmdb_id === selectedId;
    const rating = w.rating ?? 70;
    // A story with a month focus spotlights that month; everything else recedes.
    const offFocus = monthFocus != null && w.d.getUTCMonth() !== monthFocus;
    if (sel) {
      points.push({ w, x, y, color: GENRE_COLORS[primaryGenre(w.film)], op: 1, r: 5, sel: true });
    } else {
      const base = 0.35 + 0.6 * (rating / 100);
      const op = (hasSel ? base * 0.3 : base) * (offFocus ? 0.12 : 1);
      points.push({ w, x, y, color: GENRE_COLORS[primaryGenre(w.film)], op, r: 3.5, sel: false });
    }
  }

  // Selected on top
  points.sort((a, b) => Number(a.sel) - Number(b.sel) || a.op - b.op);

  const { rect, handlers } = useDragRect(
    () => ({ w: BASE_WIDTH, h: viewBoxHeight }),
    (r) => {
      const keys = new Set<string>();
      for (const w of filtered) {
        const { x, y } = place(w);
        if (rectContains(r, x, y)) keys.add(watchKey(w));
      }
      setSelection(keys);
    },
  );

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${BASE_WIDTH} ${viewBoxHeight}`}
        className="w-full"
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Swim lane chart of every watch by date. One row per year, January to December. Drag to brush a selection."
        {...handlers}
      >
        {/* Lane backgrounds */}
        {Array.from({ length: nYears }, (_, i) => (
          <rect
            key={`bg-${i}`}
            x={MARGIN_LEFT}
            y={MARGIN_TOP + i * LANE_H}
            width={CHART_WIDTH}
            height={LANE_H}
            fill={i % 2 === 0 ? "#f7f6f3" : "white"}
          />
        ))}

        {/* Month-focus spotlight band (set by a story). */}
        {monthFocus != null && (
          <rect
            x={MARGIN_LEFT + (monthFocus / 12) * CHART_WIDTH}
            y={MARGIN_TOP}
            width={CHART_WIDTH / 12}
            height={nYears * LANE_H}
            fill={ACCENT}
            fillOpacity={0.08}
          />
        )}

        {/* Rating guides: faint lines at 75 and 25 inside each lane, so the
            vertical position of a dot reads as a rating, not jitter. Thinner
            than the month dividers — they must recede. */}
        {Array.from({ length: nYears }, (_, i) => {
          const laneTop = MARGIN_TOP + i * LANE_H;
          return [75, 25].map((rating) => (
            <line
              key={`guide-${i}-${rating}`}
              x1={MARGIN_LEFT}
              y1={laneTop + (1 - rating / 100) * LANE_H}
              x2={MARGIN_LEFT + CHART_WIDTH}
              y2={laneTop + (1 - rating / 100) * LANE_H}
              stroke={INK.grid}
              strokeWidth={0.5}
              strokeOpacity={0.55}
              strokeDasharray="2 3"
            />
          ));
        })}

        {/* Month dividers */}
        {Array.from({ length: 12 }, (_, i) => {
          const x = MARGIN_LEFT + (i / 12) * CHART_WIDTH;
          return (
            <line
              key={`month-div-${i}`}
              x1={x}
              y1={MARGIN_TOP}
              x2={x}
              y2={MARGIN_TOP + nYears * LANE_H}
              stroke={INK.grid}
              strokeWidth={1}
            />
          );
        })}

        {/* Month labels */}
        {MONTHS.map((m, i) => {
          const x = MARGIN_LEFT + ((i + 0.5) / 12) * CHART_WIDTH;
          return (
            <text
              key={`month-label-${i}`}
              x={x}
              y={MARGIN_TOP + nYears * LANE_H + 18}
              fill={INK.muted}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {m}
            </text>
          );
        })}

        {/* Year labels */}
        {Array.from({ length: nYears }, (_, i) => {
          const year = startYear + i;
          const y = MARGIN_TOP + i * LANE_H + LANE_H / 2;
          return (
            <text
              key={`year-label-${i}`}
              x={MARGIN_LEFT - 8}
              y={y}
              fill={INK.primary}
              fontSize={13}
              fontWeight="bold"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {year}
            </text>
          );
        })}

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={p.color}
            fillOpacity={p.op}
            stroke={p.sel ? ACCENT : "none"}
            strokeWidth={p.sel ? 2 : 0}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover({ x: p.x, y: p.y, w: p.w })}
            onMouseLeave={() => setHover(null)}
            onClick={() => setSelected(p.w.tmdb_id)}
          />
        ))}

        {/* Brush rect */}
        <BrushRectOverlay rect={rect} />
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${(hover.x / BASE_WIDTH) * 100}%`,
            top: `${(hover.y / viewBoxHeight) * 100}%`,
            transform: "translate(-50%, -130%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <div className="font-medium">
            {hover.w.film?.title ?? hover.w.tmdb_id}
            {hover.w.film?.year != null ? ` (${hover.w.film.year})` : ""}
          </div>
          <div style={{ color: "#c3c2b7" }}>
            {hover.w.d.toISOString().slice(0, 10)} · {primaryGenre(hover.w.film)}
            {hover.w.rating != null ? ` · ${Math.round(hover.w.rating)}` : ""}
            {hover.w.rewatch ? " · rewatch" : ""}
          </div>
        </div>
      )}

      {octoberHorror != null && (
        <ChartTakeaway>October is {octoberHorror}% horror</ChartTakeaway>
      )}
    </figure>
  );
}
