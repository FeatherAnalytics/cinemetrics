"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { primaryGenre } from "@/lib/palette";
import { hairline, useTheme } from "@/lib/theme";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import { trunc, fmt1 } from "@/lib/format";
import { useAnimatedValues } from "@/lib/useAnimatedValues";
import type { EnrichedWatch } from "@/lib/types";
import { heartDim } from "@/lib/heartLens";

const W = 900;
const LABEL = 150;
const RIGHT = 64; // room for the per-franchise average label
const TOP = 24;
const ROWH = 20;
const PAD = 3;
const MAIN_MIN_WATCHES = 3; // rows below this hide behind the toggle

// Pure, so the row component can memoise on the numbers that feed it rather
// than on a closure the parent rebuilds every render.
function yAt(rating: number | null, rowTop: number, lo: number, hi: number): number {
  const top = rowTop + PAD;
  const bot = rowTop + ROWH - PAD;
  if (rating == null) return (top + bot) / 2;
  return bot - ((rating - lo) / (hi - lo || 1)) * (bot - top);
}

function xAt(t: number, x0: number, x1: number): number {
  return LABEL + ((t - x0) / (x1 - x0 || 1)) * (W - LABEL - RIGHT);
}

type Hover = { x: number; y: number; w: EnrichedWatch } | null;

/**
 * One franchise, its own component so it can hold its own tween.
 *
 * The chart as a whole cannot: a filter changes how many rows there are, and
 * `useAnimatedValues` snaps on a length change, correctly, because pairing dot
 * n of one row set with dot n of another would animate a lie. Per row the
 * pairing is real. A genre filter is a fact about FILMS, so a surviving run
 * keeps every watch it had, while its dots move for two reasons that have
 * nothing to do with its own data: the rows above it left, so its band slid up,
 * and the shared rating scale refit around whatever is still on screen.
 *
 * Module scope, so a hover does not remount every row.
 */
function FranchiseRow({
  r,
  index,
  rowTop,
  lo,
  hi,
  x0,
  x1,
  selectedId,
  heartLens,
  tokens,
  setSelected,
  setHover,
}: {
  r: Row;
  index: number;
  rowTop: number;
  lo: number;
  hi: number;
  x0: number;
  x1: number;
  selectedId: number | null;
  heartLens: boolean;
  tokens: ReturnType<typeof useTheme>["tokens"];
  setSelected: (id: number) => void;
  setHover: (h: Hover) => void;
}) {
  const rowSel = r.watches.some((w) => w.tmdb_id === selectedId);
  const dim = selectedId != null && !rowSel;

  // x is the date and never tweens. Memoised on numbers only: the hook compares
  // its target by identity, and the parent re-renders on every hover.
  const xs = useMemo(() => r.watches.map((w) => xAt(w.d.getTime(), x0, x1)), [r.watches, x0, x1]);
  const ys = useMemo(
    () => r.watches.map((w) => yAt(w.rating, rowTop, lo, hi)),
    [r.watches, rowTop, lo, hi],
  );
  const drawnY = useAnimatedValues(ys);

  const poly = xs.map((x, j) => `${x},${drawnY[j]}`).join(" ");
  const labelY = rowTop + ROWH / 2;

  return (
    <g>
      {rowSel && <rect x={0} y={rowTop} width={W} height={ROWH} fill={tokens.ui.selected} fillOpacity={0.06} />}
      <text
        x={LABEL - 8}
        y={labelY}
        fill={rowSel ? tokens.ink.primary : tokens.ink.muted}
        fontSize={9}
        textAnchor="end"
        dominantBaseline="middle"
      >
        {trunc(r.name)} · {r.filmCount}
      </text>
      <polyline
        points={poly}
        fill="none"
        stroke={tokens.ink.grid}
        strokeWidth={1}
        strokeOpacity={dim ? 0.25 : 0.8}
      />
      {r.watches.map((w, j) => (
        <circle
          key={j}
          cx={xs[j]}
          cy={drawnY[j]}
          r={w.tmdb_id === selectedId ? 3.4 : 2.6}
          fill={w.rating == null ? tokens.ink.surface : tokens.genre[primaryGenre(w.film)]}
          fillOpacity={(dim ? 0.3 : 0.9) * (heartLens ? heartDim(w) : 1)}
          stroke={
            w.tmdb_id === selectedId
              ? tokens.ui.selected
              : w.rating == null
                ? tokens.ink.muted
                : tokens.ink.surface
          }
          strokeWidth={w.tmdb_id === selectedId ? 1.5 : w.rating == null ? 1 : 0.5}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHover({ x: xs[j], y: drawnY[j], w })}
          onMouseLeave={() => setHover(null)}
          onClick={() => setSelected(w.tmdb_id)}
        />
      ))}
      {r.avg != null && (
        <text
          x={W - 4}
          y={labelY}
          fill={index === 0 ? tokens.ink.primary : tokens.ink.muted}
          fontSize={9}
          fontWeight={index === 0 ? 700 : 400}
          textAnchor="end"
          dominantBaseline="middle"
        >
          avg {fmt1(r.avg)}
        </text>
      )}
    </g>
  );
}

type Row = {
  name: string;
  watches: EnrichedWatch[];
  filmCount: number;
  avg: number | null;
};

export function FranchiseRuns() {
  const { all, filters, selectedId, setSelected, setSelection, heartLens } = useExplorer();
  const { tokens } = useTheme();
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
      // Under the heart lens a run with nothing hearted in it leaves entirely. The
      // dots stay whole so the run still reads as a run, but a collection I never
      // loved a single entry of has no place in a story about what I love.
      if (heartLens && !ws.some((w) => w.heart === true)) continue;
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
  }, [all, filters, heartLens]);

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
  const x = (t: number) => xAt(t, x0, x1);
  // Brush hit-testing reads the SETTLED position, not the drawn one. Testing
  // against a dot mid-flight would select whatever the tween happened to be
  // passing through at mouse-up.
  const yRating = (rating: number | null, rowTop: number) => yAt(rating, rowTop, lo, hi);

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
        className="rounded-md border border-dashed px-4 py-6 text-sm"
        style={{
          color: tokens.ink.muted,
          borderColor: hairline(tokens.ink.primary, 15),
        }}
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
              <line x1={xx} y1={TOP - 4} x2={xx} y2={H - 6} stroke={tokens.ink.grid} strokeWidth={0.5} />
              <text x={xx} y={TOP - 8} fill={tokens.ink.muted} fontSize={10} textAnchor="middle">{Y}</text>
            </g>
          );
        })}

        {rows.map((r, i) => (
          <FranchiseRow
            key={r.name}
            r={r}
            index={i}
            rowTop={TOP + i * ROWH}
            lo={lo}
            hi={hi}
            x0={x0}
            x1={x1}
            selectedId={selectedId}
            heartLens={heartLens}
            tokens={tokens}
            setSelected={setSelected}
            setHover={setHover}
          />
        ))}

        <BrushRectOverlay rect={rect} accent={tokens.accent} />
      </svg>

      <figcaption
        className="mt-1 flex items-center gap-3 font-mono text-xs"
        style={{ color: tokens.ink.muted }}
      >
        <span>row = franchise · dot = watch, height = rating</span>
        {minor.length > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--foreground)]"
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
            background: tokens.ink.primary,
            color: tokens.ink.surface,
          }}
        >
          <div className="font-medium">
            {hover.w.film?.title ?? hover.w.tmdb_id}
            {hover.w.film?.year != null ? ` (${hover.w.film.year})` : ""}
          </div>
          <div style={{ color: tokens.ink.surface, opacity: 0.75 }}>
            {hover.w.d.toISOString().slice(0, 10)}
            {hover.w.rating != null ? ` · ${Math.round(hover.w.rating)}` : " · unrated"}
            {hover.w.rewatch ? " · rewatch" : " · first"}
          </div>
        </div>
      )}
    </figure>
  );
}
