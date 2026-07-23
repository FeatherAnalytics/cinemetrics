"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import { useDragRect, watchKey } from "@/lib/brush";
import { trunc } from "@/lib/format";
import { buildSeries, DIMENSIONS, type Dimension, type Series } from "@/lib/series";
import { computeAvgRating } from "@/lib/stats";

// Chart geometry. Each panel is measured and drawn 1:1 in CSS pixels: width
// tracks the grid column (fluid), height is FIXED so every panel is the same
// height regardless of how many columns the layout uses. 1 viewBox unit = 1px,
// so strokes and text stay a constant size across panels (no aspect scaling).
const H = 260; // fixed panel height in px
const ML = 30; // left margin (y labels)
const MR = 12;
const MT = 12;
const MB = 20; // bottom margin (x labels)
const WINDOW = 10;

const OVERALL_COLOR = "#a7a59c"; // muted neutral — a reference, not a category
const LABEL_MAX = 18; // panel labels truncate shorter than the film-title default

type SeriesPointLite = { x: number; y: number };

type Domain = {
  xMin: number;
  xMax: number;
  lo: number;
  hi: number;
  yTicks: number[];
  // Flat reference: mean rating over the current filter set. The old grey
  // rolling line plotted "nth watch overall" against "nth watch in group" —
  // different moments in time at the same x — so it compared nothing real.
  overallAvg: number | null;
};

/** Track an element's rendered width via ResizeObserver (for the 1:1 viewBox). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Module-scope so its identity is stable — a component defined inside the parent
// would remount every panel on each hover.
function PanelChart({
  s,
  dom,
  hoverX,
  setHoverX,
  setSelection,
}: {
  s: Series;
  dom: Domain;
  hoverX: number | null;
  setHoverX: (n: number | null) => void;
  setSelection: (keys: Set<string> | null) => void;
}) {
  const [ref, w] = useWidth();
  const { xMin, xMax, lo, hi, yTicks, overallAvg } = dom;

  const x = (n: number) => ML + ((n - xMin) / Math.max(1, xMax - xMin)) * (w - ML - MR);
  const y = (v: number) => MT + (1 - (v - lo) / (hi - lo || 1)) * (H - MT - MB);
  const xInv = (px: number) => xMin + ((px - ML) / Math.max(1, w - ML - MR)) * (xMax - xMin);
  const line = (pts: SeriesPointLite[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  const at = (pts: SeriesPointLite[], n: number) => pts.find((p) => p.x === n);

  const hov = hoverX != null ? at(s.points, hoverX) : undefined;

  // x-range brush: the selection is every watch that fed the brushed data points,
  // i.e. positions [a-(window-1), b] of this series (each point is a trailing
  // WINDOW-watch mean, so the leftmost point pulls in the prior WINDOW-1 watches).
  const { rect, handlers, isDragging } = useDragRect(
    () => ({ w, h: H }),
    (r) => {
      const a = Math.round(xInv(r.x0));
      const b = Math.round(xInv(r.x1));
      const from = Math.max(1, Math.min(a, b) - (WINDOW - 1));
      const to = Math.max(a, b);
      const keys = new Set<string>();
      for (let pos = from; pos <= to; pos++) {
        const ww = s.allWatches[pos - 1];
        if (ww) keys.add(watchKey(ww));
      }
      setSelection(keys);
    },
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    if (px < ML || px > w - MR) return setHoverX(null);
    const n = Math.round(xInv(px));
    setHoverX(Math.min(xMax, Math.max(xMin, n)));
  };

  return (
    <figure className="m-0">
      <figcaption className="mb-0.5 flex items-baseline gap-1.5 text-xs" style={{ color: INK.secondary }}>
        <span className="inline-block rounded-sm" style={{ width: 12, height: 2.5, background: s.color }} />
        <span className="font-medium">{trunc(s.label, LABEL_MAX)}</span>
        <span style={{ color: INK.muted }}>· {s.total}</span>
      </figcaption>
      <div ref={ref}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          style={{ touchAction: "none" }}
          role="img"
          aria-label={`${s.label}: rolling ${WINDOW}-watch average rating against my overall average. Drag across to brush the films behind a stretch.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverX(null)}
          {...handlers}
        >
          {rect && (
            <rect
              x={rect.x0}
              y={MT}
              width={rect.x1 - rect.x0}
              height={H - MT - MB}
              fill={ACCENT}
              fillOpacity={0.1}
              stroke={ACCENT}
              strokeOpacity={0.4}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={ML} y1={y(v)} x2={w - MR} y2={y(v)} stroke={INK.grid} strokeWidth={0.75} />
              <text x={ML - 5} y={y(v)} fill={INK.muted} fontSize={10} textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}

          <text x={ML} y={H - 5} fill={INK.muted} fontSize={10} textAnchor="start">{xMin}</text>
          <text x={w - MR} y={H - 5} fill={INK.muted} fontSize={10} textAnchor="end">{xMax}</text>

          {hoverX != null && (
            <line x1={x(hoverX)} y1={MT} x2={x(hoverX)} y2={H - MB} stroke={INK.axis} strokeWidth={0.75} strokeDasharray="2 2" />
          )}

          {overallAvg != null && (
            <line
              x1={ML}
              y1={y(overallAvg)}
              x2={w - MR}
              y2={y(overallAvg)}
              stroke={OVERALL_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}
          <path d={line(s.points)} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

          {hov && <circle cx={x(hov.x)} cy={y(hov.y)} r={3.2} fill={s.color} stroke={INK.surface} strokeWidth={1} />}

          {hov && (
            <text
              x={x(hov.x)}
              y={MT + 9}
              fill={s.color}
              fontSize={11}
              fontWeight={600}
              textAnchor={x(hov.x) > w / 2 ? "end" : "start"}
            >
              {Math.round(hov.y)}
            </text>
          )}
        </svg>
      </div>
    </figure>
  );
}

export function RollingRating() {
  const { all, filtered, setSelection, rollingDimension } = useExplorer();
  const [localDim, setLocalDim] = useState<Dimension>("genre");
  const dim = (rollingDimension as Dimension) ?? localDim;
  const setDim = setLocalDim;
  const [hoverX, setHoverX] = useState<number | null>(null);

  const series = useMemo(
    () => buildSeries(all, filtered, dim, { window: WINDOW }),
    [all, filtered, dim],
  );

  const panels = series.filter((s) => !s.isOverall);

  // Shared scales across every panel so the small multiples stay comparable.
  const dom: Domain = useMemo(() => {
    const overallAvg = computeAvgRating(filtered).mean;
    let xMin = Infinity;
    let xMax = 1;
    let mn = 100;
    let mx = 0;
    for (const s of panels)
      for (const p of s.points) {
        xMin = Math.min(xMin, p.x);
        xMax = Math.max(xMax, p.x);
        mn = Math.min(mn, p.y);
        mx = Math.max(mx, p.y);
      }
    if (!Number.isFinite(xMin)) xMin = WINDOW;
    if (overallAvg != null) {
      mn = Math.min(mn, overallAvg);
      mx = Math.max(mx, overallAvg);
    }
    if (mx < mn) return { xMin: WINDOW, xMax: WINDOW + 1, lo: 0, hi: 100, yTicks: [0, 50, 100], overallAvg };
    const lo = Math.max(0, Math.floor((mn - 2) / 5) * 5);
    const hi = Math.min(100, Math.ceil((mx + 2) / 5) * 5);
    return { xMin, xMax, lo, hi, yTicks: [lo, Math.round((lo + hi) / 2), hi], overallAvg };
  }, [panels, filtered]);

  if (panels.length === 0) {
    return <p className="text-sm" style={{ color: INK.muted }}>Not enough rated watches to plot.</p>;
  }

  return (
    <div>
      {/* Dimension switcher */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div
          className="flex flex-wrap overflow-hidden rounded-full border text-sm"
          style={{ borderColor: "rgba(11,11,11,0.18)", width: "fit-content" }}
          role="group"
          aria-label="Group the panels by"
        >
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDim(d.key)}
              aria-pressed={dim === d.key}
              className="px-3 py-1 capitalize transition"
              style={{
                background: dim === d.key ? ACCENT : "transparent",
                color: dim === d.key ? INK.surface : INK.secondary,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: INK.muted }}>
          <span
            className="inline-block"
            style={{ width: 14, borderTop: `2px dashed ${OVERALL_COLOR}` }}
          />
          my average across current filters
        </span>
      </div>

      {/* Exactly four panels (runtime) lay out as a roomier 2×2 rather than 3+1. */}
      <div
        className={`grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 ${
          panels.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3"
        }`}
      >
        {panels.map((s) => (
          <PanelChart
            key={s.key}
            s={s}
            dom={dom}
            hoverX={hoverX}
            setHoverX={setHoverX}
            setSelection={setSelection}
          />
        ))}
      </div>

      <p className="mt-2 font-mono text-xs" style={{ color: INK.muted }}>
        trailing {WINDOW}-watch mean of my rating · x = nth watch in that group (starts at the {WINDOW}th)
      </p>
    </div>
  );
}
