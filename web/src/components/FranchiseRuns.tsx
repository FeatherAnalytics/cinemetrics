"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import { trunc, fmt1 } from "@/lib/format";
import type { EnrichedWatch } from "@/lib/types";

const W = 900;
const LABEL = 150;
const RIGHT = 64; // room for the per-franchise average label
const TOP = 24;
const ROWH = 20;
const PAD = 3;
const MAIN_MIN_WATCHES = 3; // rows below this hide behind the toggle

type Row = {
  name: string;
  watches: EnrichedWatch[];
  filmCount: number;
  avg: number | null;
};

export function FranchiseRuns() {
  const { all, filters, selectedId, setSelected, setSelection } = useExplorer();
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; w: EnrichedWatch } | null>(null);

  const { main, minor, x0, x1 } = useMemo(() => {
    // Rewatch-mode is ignored so a franchise row always shows its whole run.
    const watches = filterWatches(all, { ...filters, rewatch: "all" });
    const byCollection = new Map<string, EnrichedWatch[]>();
    for (const w of watches) {
      const c = w.film?.collection;
      if (!c) continue;
      const list = byCollection.get(c) ?? [];
      list.push(w);
      byCollection.set(c, list);
    }
    const rows: Row[] = [];
    for (const [name, ws] of byCollection) {
      const filmIds = new Set(ws.map((w) => w.tmdb_id));
      if (filmIds.size < 2) continue; // one entry isn't a run
      const sorted = [...ws].sort((a, b) => a.d.getTime() - b.d.getTime());
      const rated = sorted.filter((w) => w.rating != null).map((w) => w.rating as number);
      rows.push({
        name: name.replace(/ Collection$/, ""),
        watches: sorted,
        filmCount: filmIds.size,
        avg: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
      });
    }
    rows.sort(
      (a, b) => b.watches.length - a.watches.length || a.name.localeCompare(b.name),
    );
    const main = rows.filter((r) => r.watches.length >= MAIN_MIN_WATCHES);
    const minor = rows.filter((r) => r.watches.length < MAIN_MIN_WATCHES);
    const times = all.map((w) => w.d.getTime());
    const x0 = times.length ? Math.min(...times) : 0;
    const x1 = times.length ? Math.max(...times) : 1;
    return { main, minor, x0, x1 };
  }, [all, filters]);

  const rows = useMemo(
    () => (showAll ? [...main, ...minor] : main),
    [main, minor, showAll],
  );

  // Shared rating scale, fit to what's shown and rounded out to tens.
  const [lo, hi] = useMemo(() => {
    let mn = 100, mx = 0, seen = false;
    for (const r of rows)
      for (const w of r.watches)
        if (w.rating != null) {
          seen = true;
          mn = Math.min(mn, w.rating);
          mx = Math.max(mx, w.rating);
        }
    if (!seen) return [0, 100];
    return [Math.max(0, Math.floor((mn - 5) / 10) * 10), Math.min(100, Math.ceil((mx + 5) / 10) * 10)];
  }, [rows]);

  const H = TOP + rows.length * ROWH + 10;
  const x = (t: number) => LABEL + ((t - x0) / (x1 - x0 || 1)) * (W - LABEL - RIGHT);
  const yRating = (rating: number | null, rowTop: number) => {
    const top = rowTop + PAD;
    const bot = rowTop + ROWH - PAD;
    if (rating == null) return (top + bot) / 2;
    return bot - ((rating - lo) / (hi - lo || 1)) * (bot - top);
  };

  const years: number[] = [];
  for (let Y = new Date(x0).getUTCFullYear(); Y <= new Date(x1).getUTCFullYear(); Y++) {
    if (Date.UTC(Y, 0, 1) >= x0) years.push(Y);
  }

  const { rect, handlers } = useDragRect(
    () => ({ w: W, h: H }),
    (r) => {
      const keys = new Set<string>();
      rows.forEach((row, i) =>
        row.watches.forEach((w) => {
          const rowTop = TOP + i * ROWH;
          if (rectContains(r, x(w.d.getTime()), yRating(w.rating, rowTop))) keys.add(watchKey(w));
        }),
      );
      setSelection(keys);
    },
  );

  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No franchise with two or more watched films under the current filters.
      </div>
    );
  }

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ touchAction: "none" }}
        role="img"
        aria-label="One row per franchise; dots are watches over time, height is my rating. Drag to brush a selection."
        {...handlers}
      >
        {years.map((Y) => {
          const xx = x(Date.UTC(Y, 0, 1));
          return (
            <g key={Y}>
              <line x1={xx} y1={TOP - 4} x2={xx} y2={H - 6} stroke={INK.grid} strokeWidth={0.5} />
              <text x={xx} y={TOP - 8} fill={INK.muted} fontSize={10} textAnchor="middle">{Y}</text>
            </g>
          );
        })}

        {rows.map((r, i) => {
          const rowTop = TOP + i * ROWH;
          const rowSel = r.watches.some((w) => w.tmdb_id === selectedId);
          const dim = selectedId != null && !rowSel;
          const pts = r.watches.map((w) => ({
            x: x(w.d.getTime()),
            y: yRating(w.rating, rowTop),
            w,
          }));
          const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
          const labelY = rowTop + ROWH / 2;
          return (
            <g key={r.name}>
              {rowSel && <rect x={0} y={rowTop} width={W} height={ROWH} fill={ACCENT} fillOpacity={0.06} />}
              <text
                x={LABEL - 8}
                y={labelY}
                fill={rowSel ? INK.primary : INK.muted}
                fontSize={9}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {trunc(r.name)} · {r.filmCount}
              </text>
              <polyline
                points={poly}
                fill="none"
                stroke={INK.grid}
                strokeWidth={1}
                strokeOpacity={dim ? 0.25 : 0.8}
              />
              {pts.map((p, j) => (
                <circle
                  key={j}
                  cx={p.x}
                  cy={p.y}
                  r={p.w.tmdb_id === selectedId ? 3.4 : 2.6}
                  fill={p.w.rating == null ? INK.surface : GENRE_COLORS[primaryGenre(p.w.film)]}
                  fillOpacity={dim ? 0.3 : 0.9}
                  stroke={p.w.tmdb_id === selectedId ? ACCENT : p.w.rating == null ? INK.muted : INK.surface}
                  strokeWidth={p.w.tmdb_id === selectedId ? 1.5 : p.w.rating == null ? 1 : 0.5}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover({ x: p.x, y: p.y, w: p.w })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(p.w.tmdb_id)}
                />
              ))}
              {r.avg != null && (
                <text
                  x={W - 4}
                  y={labelY}
                  fill={i === 0 ? INK.primary : INK.muted}
                  fontSize={9}
                  fontWeight={i === 0 ? 700 : 400}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  avg {fmt1(r.avg)}
                </text>
              )}
            </g>
          );
        })}

        <BrushRectOverlay rect={rect} />
      </svg>

      <figcaption className="mt-1 flex items-center gap-3 font-mono text-xs text-[#67655f]">
        <span>row = franchise · dot = watch, height = rating</span>
        {minor.length > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="underline decoration-dotted underline-offset-2 hover:text-[#0b0b0b]"
          >
            {showAll ? "hide" : "show"} {minor.length} two-watch franchises
          </button>
        )}
      </figcaption>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, -150%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <div className="font-medium">
            {hover.w.film?.title ?? hover.w.tmdb_id}
            {hover.w.film?.year != null ? ` (${hover.w.film.year})` : ""}
          </div>
          <div style={{ color: "#c3c2b7" }}>
            {hover.w.d.toISOString().slice(0, 10)}
            {hover.w.rating != null ? ` · ${Math.round(hover.w.rating)}` : " · unrated"}
            {hover.w.rewatch ? " · rewatch" : " · first"}
          </div>
        </div>
      )}
    </figure>
  );
}
