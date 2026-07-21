"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { rectContains, useDragRect, watchKey } from "@/lib/brush";
import type { EnrichedWatch, Film } from "@/lib/types";

const W = 900;
const LABEL = 150;
const RIGHT = 14;
const TOP = 24;
const ROWH = 20;
const PAD = 3; // vertical padding inside each row band

type Row = { tmdb_id: number; film: Film | undefined; watches: EnrichedWatch[]; count: number };

function trunc(s: string, n = 26): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function RewatchCadence() {
  const { all, filters, selectedId, setSelected, setSelection } = useExplorer();
  const [hover, setHover] = useState<{ x: number; y: number; row: Row; w: EnrichedWatch } | null>(
    null,
  );

  const { rows, x0, x1 } = useMemo(() => {
    const watches = filterWatches(all, { ...filters, rewatch: "all" });
    const byFilm = new Map<number, EnrichedWatch[]>();
    for (const w of watches) {
      const a = byFilm.get(w.tmdb_id);
      if (a) a.push(w);
      else byFilm.set(w.tmdb_id, [w]);
    }
    const rows: Row[] = [];
    for (const [tid, ws] of byFilm) {
      if (ws.length < 2) continue;
      const sorted = [...ws].sort((a, b) => a.d.getTime() - b.d.getTime());
      rows.push({ tmdb_id: tid, film: ws[0].film, watches: sorted, count: ws.length });
    }
    rows.sort((a, b) => b.count - a.count || a.watches[0].d.getTime() - b.watches[0].d.getTime());
    const times = all.map((w) => w.d.getTime());
    return { rows, x0: Math.min(...times), x1: Math.max(...times) };
  }, [all, filters]);

  // Shared rating scale across every row, fit to the ratings present and rounded
  // out to tens, so a dot's height means the same thing in every film's band.
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

  const summary = useMemo(() => {
    let up = 0, down = 0, same = 0;
    for (const r of rows) {
      const rated = r.watches.filter((w) => w.rating != null);
      if (rated.length < 2) continue;
      const d = (rated[rated.length - 1].rating as number) - (rated[0].rating as number);
      if (d > 0) up++;
      else if (d < 0) down++;
      else same++;
    }
    return { up, down, same };
  }, [rows]);

  const H = TOP + rows.length * ROWH + 10;
  const x = (t: number) => LABEL + ((t - x0) / (x1 - x0 || 1)) * (W - LABEL - RIGHT);
  const yRating = (rating: number | null, i: number) => {
    const top = TOP + i * ROWH + PAD;
    const bot = TOP + i * ROWH + ROWH - PAD;
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
          if (rectContains(r, x(w.d.getTime()), yRating(w.rating, i))) keys.add(watchKey(w));
        }),
      );
      setSelection(keys);
    },
  );

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Each row a rewatched film; dots are watches over time, height is my rating. Drag to brush a selection."
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
          const sel = r.tmdb_id === selectedId;
          const color = sel ? ACCENT : GENRE_COLORS[primaryGenre(r.film)];
          const dim = selectedId != null && !sel;
          const pts = r.watches.map((w) => ({ x: x(w.d.getTime()), y: yRating(w.rating, i), w }));
          const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
          const labelY = TOP + i * ROWH + ROWH / 2;
          return (
            <g key={r.tmdb_id} style={{ cursor: "pointer" }} onClick={() => setSelected(r.tmdb_id)}>
              {sel && <rect x={0} y={TOP + i * ROWH} width={W} height={ROWH} fill={ACCENT} fillOpacity={0.06} />}
              <text
                x={LABEL - 8}
                y={labelY}
                fill={sel ? INK.primary : INK.muted}
                fontSize={9}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {trunc(r.film?.title ?? String(r.tmdb_id))}
              </text>
              <polyline
                points={poly}
                fill="none"
                stroke={color}
                strokeWidth={sel ? 1.75 : 1.1}
                strokeOpacity={dim ? 0.3 : 0.85}
              />
              {pts.map((p, j) => (
                <circle
                  key={j}
                  cx={p.x}
                  cy={p.y}
                  r={sel ? 3.4 : 2.6}
                  fill={p.w.rating == null ? INK.surface : color}
                  fillOpacity={dim ? 0.3 : 0.9}
                  stroke={p.w.rating == null ? INK.muted : INK.surface}
                  strokeWidth={p.w.rating == null ? 1 : 0.5}
                  onMouseEnter={() => setHover({ x: p.x, y: p.y, row: r, w: p.w })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </g>
          );
        })}

        {rect && (
          <rect
            x={rect.x0}
            y={rect.y0}
            width={rect.x1 - rect.x0}
            height={rect.y1 - rect.y0}
            fill={ACCENT}
            fillOpacity={0.08}
            stroke={ACCENT}
            strokeOpacity={0.5}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
      </svg>

      <figcaption className="mt-1 font-mono text-xs text-[#67655f]">
        higher dot = higher rating · {summary.up} grew · {summary.down} soured · {summary.same} unchanged
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
            {hover.row.film?.title ?? hover.row.tmdb_id}
            {hover.row.film?.year != null ? ` (${hover.row.film.year})` : ""}
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
