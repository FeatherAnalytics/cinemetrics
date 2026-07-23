"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import { trunc } from "@/lib/format";
import type { EnrichedWatch, Film } from "@/lib/types";

const W = 900;
const LABEL = 150;
const RIGHT = 64; // room for the "first → last" labels
const TOP = 24;
const ROWH = 20;
const HEADER_H = 26;
const PAD = 3; // vertical padding inside each row band

type Row = {
  tmdb_id: number;
  film: Film | undefined;
  watches: EnrichedWatch[];
  count: number;
  first: number | null; // first rated watch's rating
  last: number | null; // last rated watch's rating
  delta: number | null; // last - first; null with fewer than 2 rated watches
};

type Band = { label: string; rows: Row[]; headerY: number; startY: number };

export function RewatchCadence() {
  const { all, filters, selectedId, setSelected, setSelection } = useExplorer();
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; row: Row; w: EnrichedWatch } | null>(
    null,
  );

  const { grew, soured, unchanged, x0, x1 } = useMemo(() => {
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
      const rated = sorted.filter((w) => w.rating != null);
      const first = rated.length >= 2 ? (rated[0].rating as number) : null;
      const last = rated.length >= 2 ? (rated[rated.length - 1].rating as number) : null;
      rows.push({
        tmdb_id: tid,
        film: ws[0].film,
        watches: sorted,
        count: ws.length,
        first,
        last,
        delta: first != null && last != null ? last - first : null,
      });
    }
    // The films whose rating moved lead, biggest move first; unchanged rows keep
    // the old most-rewatched-first order.
    const byDelta = (a: Row, b: Row) =>
      Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || b.count - a.count;
    const byCount = (a: Row, b: Row) =>
      b.count - a.count || a.watches[0].d.getTime() - b.watches[0].d.getTime();
    const grew = rows.filter((r) => (r.delta ?? 0) > 0).sort(byDelta);
    const soured = rows.filter((r) => (r.delta ?? 0) < 0).sort(byDelta);
    const unchanged = rows.filter((r) => (r.delta ?? 0) === 0).sort(byCount);
    const times = all.map((w) => w.d.getTime());
    return { grew, soured, unchanged, x0: Math.min(...times), x1: Math.max(...times) };
  }, [all, filters]);

  const visibleRows = useMemo(
    () => [...grew, ...soured, ...(showUnchanged ? unchanged : [])],
    [grew, soured, unchanged, showUnchanged],
  );

  // Shared rating scale across every row, fit to the ratings present and rounded
  // out to tens, so a dot's height means the same thing in every film's band.
  const [lo, hi] = useMemo(() => {
    let mn = 100, mx = 0, seen = false;
    for (const r of visibleRows)
      for (const w of r.watches)
        if (w.rating != null) {
          seen = true;
          mn = Math.min(mn, w.rating);
          mx = Math.max(mx, w.rating);
        }
    if (!seen) return [0, 100];
    return [Math.max(0, Math.floor((mn - 5) / 10) * 10), Math.min(100, Math.ceil((mx + 5) / 10) * 10)];
  }, [visibleRows]);

  // Bands stacked with a header row each; empty bands disappear entirely.
  const { bands, H } = useMemo(() => {
    const defs = [
      { label: `grew · ${grew.length}`, rows: grew },
      { label: `soured · ${soured.length}`, rows: soured },
      ...(showUnchanged ? [{ label: `unchanged · ${unchanged.length}`, rows: unchanged }] : []),
    ].filter((b) => b.rows.length > 0);
    let yCur = TOP;
    const bands: Band[] = defs.map((b) => {
      const headerY = yCur;
      yCur += HEADER_H;
      const startY = yCur;
      yCur += b.rows.length * ROWH;
      return { ...b, headerY, startY };
    });
    return { bands, H: yCur + 10 };
  }, [grew, soured, unchanged, showUnchanged]);

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
      for (const band of bands)
        band.rows.forEach((row, i) =>
          row.watches.forEach((w) => {
            const rowTop = band.startY + i * ROWH;
            if (rectContains(r, x(w.d.getTime()), yRating(w.rating, rowTop))) keys.add(watchKey(w));
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
        aria-label="Rewatched films grouped by whether my rating grew, soured, or held; dots are watches over time, height is my rating. Drag to brush a selection."
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

        {bands.map((band) => (
          <g key={band.label}>
            <text
              x={0}
              y={band.headerY + HEADER_H / 2 + 4}
              fill={INK.secondary}
              fontSize={10}
              fontFamily="var(--font-mono)"
              letterSpacing="0.1em"
            >
              {band.label.toUpperCase()}
            </text>
            <line
              x1={LABEL}
              y1={band.headerY + HEADER_H / 2}
              x2={W - 4}
              y2={band.headerY + HEADER_H / 2}
              stroke={INK.grid}
              strokeWidth={0.5}
            />

            {band.rows.map((r, i) => {
              const rowTop = band.startY + i * ROWH;
              const sel = r.tmdb_id === selectedId;
              const color = sel ? ACCENT : GENRE_COLORS[primaryGenre(r.film)];
              const dim = selectedId != null && !sel;
              const pts = r.watches.map((w) => ({
                x: x(w.d.getTime()),
                y: yRating(w.rating, rowTop),
                w,
              }));
              const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
              const labelY = rowTop + ROWH / 2;
              return (
                <g key={r.tmdb_id} style={{ cursor: "pointer" }} onClick={() => setSelected(r.tmdb_id)}>
                  {sel && <rect x={0} y={rowTop} width={W} height={ROWH} fill={ACCENT} fillOpacity={0.06} />}
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
                  {r.delta != null && r.delta !== 0 && (
                    <text
                      x={W - 4}
                      y={labelY}
                      fill={i === 0 ? INK.primary : INK.muted}
                      fontSize={9}
                      fontWeight={i === 0 ? 700 : 400}
                      textAnchor="end"
                      dominantBaseline="middle"
                    >
                      {r.first} → {r.last}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}

        <BrushRectOverlay rect={rect} />
      </svg>

      <figcaption className="mt-1 flex items-center gap-3 font-mono text-xs text-[#67655f]">
        <span>higher dot = higher rating</span>
        {unchanged.length > 0 && (
          <button
            onClick={() => setShowUnchanged((v) => !v)}
            className="underline decoration-dotted underline-offset-2 hover:text-[#0b0b0b]"
          >
            {showUnchanged ? "hide" : "show"} {unchanged.length} unchanged
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
