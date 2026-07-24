"use client";

import { useCallback, useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import { isSolstice, SunMarker } from "@/lib/solstice";
import type { EnrichedWatch } from "@/lib/types";
import { ChartTakeaway } from "./ChartTakeaway";

const MARGIN_LEFT = 55;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 30;
const MARGIN_RIGHT = 10;
const LANE_H = 70;
const BASE_WIDTH = 720;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Pt = {
  w: EnrichedWatch;
  x: number;
  y: number;
  color: string;
  op: number;
  r: number;
  sel: boolean;
  unrated: boolean; // no rating: drawn as a hollow ring at the lane midline
};

export function SwimLaneChart() {
  const { all, filtered, yearBounds, selectedId, setSelected, setSelection, storyResult } =
    useExplorer();
  const [hover, setHover] = useState<{ x: number; y: number; w: EnrichedWatch } | null>(null);
  const monthFocus = storyResult?.monthFocus ?? null;
  const showYearMeans = storyResult?.yearMeans ?? false;

  const [startYear, endYear] = yearBounds;
  const nYears = Math.max(1, endYear - startYear + 1);
  const CHART_WIDTH = BASE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const viewBoxHeight = MARGIN_TOP + nYears * LANE_H + MARGIN_BOTTOM;

  const place = useCallback(
    (w: EnrichedWatch): { x: number; y: number } => {
      const yearIndex = w.d.getUTCFullYear() - startYear;
      const laneTop = MARGIN_TOP + yearIndex * LANE_H;
      const x = MARGIN_LEFT + w.yearFrac * CHART_WIDTH;
      const rating = w.rating ?? 70;
      const y = laneTop + (1 - rating / 100) * LANE_H;
      return { x, y };
    },
    [startYear, CHART_WIDTH],
  );

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

  // Geometry is memoized so hover state changes only re-render the tooltip,
  // not the full field of circles.
  const points = useMemo<Pt[]>(() => {
    const filteredSet = new Set(filtered.map(watchKey));
    const ghosts = all.filter((w) => !filteredSet.has(watchKey(w)));
    const pts: Pt[] = [];

    // Ghosts first
    for (const w of ghosts) {
      const { x, y } = place(w);
      pts.push({ w, x, y, color: INK.muted, op: 0.08, r: 3.5, sel: false, unrated: w.rating == null });
    }

    // Active dots
    for (const w of filtered) {
      const { x, y } = place(w);
      const sel = hasSel && w.tmdb_id === selectedId;
      const rating = w.rating ?? 70;
      const unrated = w.rating == null;
      // A story with a month focus spotlights that month; everything else recedes.
      const offFocus = monthFocus != null && w.d.getUTCMonth() !== monthFocus;
      if (sel) {
        pts.push({ w, x, y, color: GENRE_COLORS[primaryGenre(w.film)], op: 1, r: 5, sel: true, unrated });
      } else {
        const base = 0.35 + 0.6 * (rating / 100);
        const op = (hasSel ? base * 0.3 : base) * (offFocus ? 0.12 : 1);
        pts.push({ w, x, y, color: GENRE_COLORS[primaryGenre(w.film)], op, r: 3.5, sel: false, unrated });
      }
    }

    // Same-day watches with the same rating land on the same pixel and read as
    // one film. Dodge them apart horizontally so a double feature shows two dots.
    const collisions = new Map<string, Pt[]>();
    for (const p of pts) {
      const key = `${p.w.date}|${p.w.rating ?? "u"}`;
      const group = collisions.get(key) ?? [];
      group.push(p);
      collisions.set(key, group);
    }
    for (const group of collisions.values()) {
      if (group.length < 2) continue;
      group.forEach((p, k) => {
        p.x += (k - (group.length - 1) / 2) * 5;
      });
    }

    // Selected on top
    pts.sort((a, b) => Number(a.sel) - Number(b.sel) || a.op - b.op);
    return pts;
  }, [all, filtered, hasSel, selectedId, monthFocus, place]);

  // The circle elements are memoized as JSX so a tooltip show/hide (hover
  // state) doesn't rebuild ~1,500 SVG nodes.
  const circleLayer = useMemo(
    () =>
      points.map((p, i) => {
        const handlers = {
          onMouseEnter: () => setHover({ x: p.x, y: p.y, w: p.w }),
          onMouseLeave: () => setHover(null),
          onClick: () => setSelected(p.w.tmdb_id),
        };
        if (isSolstice(p.w)) {
          // The sun stays recognisable when highlighted but fades with the
          // ghosts when filters exclude it.
          const op = p.op < 0.3 ? 0.35 : Math.max(p.op, 0.9);
          return (
            <g key={i} opacity={op} style={{ cursor: "pointer" }} {...handlers}>
              <SunMarker x={p.x} y={p.y} />
            </g>
          );
        }
        const ring = p.unrated && !p.sel;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={ring ? "none" : p.color}
            fillOpacity={ring ? 0 : p.op}
            stroke={p.sel ? ACCENT : ring ? p.color : "none"}
            strokeWidth={p.sel ? 2 : ring ? 1 : 0}
            strokeOpacity={ring ? p.op : 1}
            style={{ cursor: "pointer" }}
            {...handlers}
          />
        );
      }),
    [points, setSelected],
  );

  // Per-year average markers, shown only when a story asks for them (the
  // "getting pickier" trend is invisible dot-by-dot; one line per lane isn't).
  const yearMeanLayer = useMemo(() => {
    if (!showYearMeans) return null;
    const by = new Map<number, { sum: number; n: number }>();
    for (const w of filtered) {
      if (w.rating == null) continue;
      const y = w.d.getUTCFullYear();
      const e = by.get(y) ?? { sum: 0, n: 0 };
      e.sum += w.rating;
      e.n += 1;
      by.set(y, e);
    }
    return [...by.entries()].map(([year, { sum, n }]) => {
      const mean = sum / n;
      const laneTop = MARGIN_TOP + (year - startYear) * LANE_H;
      const y = laneTop + (1 - mean / 100) * LANE_H;
      return (
        <g key={year}>
          <line
            x1={MARGIN_LEFT}
            y1={y}
            x2={MARGIN_LEFT + CHART_WIDTH}
            y2={y}
            stroke={ACCENT}
            strokeWidth={1.5}
            strokeOpacity={0.45}
            strokeDasharray="7 5"
          />
          <text
            x={MARGIN_LEFT + CHART_WIDTH - 4}
            y={y + 12}
            fill={ACCENT}
            fontSize={10}
            fontWeight="bold"
            textAnchor="end"
          >
            {Math.round(mean)}
          </text>
        </g>
      );
    });
  }, [showYearMeans, filtered, startYear, CHART_WIDTH]);

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

        {/* Points. Unrated watches (no score) draw as a hollow ring at the lane
            midline, so they can't be mistaken for a genuine mid-70s rating. */}
        {circleLayer}

        {/* Story-gated per-year average markers. */}
        {yearMeanLayer}

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
