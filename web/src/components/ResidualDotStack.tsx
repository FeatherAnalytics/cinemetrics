"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { BrushRectOverlay, rectContains, useDragRect, watchKey } from "@/lib/brush";
import { computeResiduals, type FilmResidual } from "@/lib/stats";
import { ChartTakeaway } from "./ChartTakeaway";

const W = 900;
const ML = 16;
const MR = 16;
const MT = 12;
const MB = 36;
// One column per half-star (10 points on the 0-100 scale), matching the tick
// spacing and Letterboxd's own rating granularity. Columns are CENTRED on the
// ticks rather than spanning between them: binning by edges would sit each
// column on a quarter-star, half a step off the axis labels beneath it.
const BIN = 10;

type Dot = FilmResidual & {
  genre: GenreKey;
  title: string;
  year: number | null;
  cx: number;
  cy: number;
};

export function ResidualDotStack() {
  const { filtered, byId, selectedId, setSelected, setSelection } = useExplorer();
  const [hover, setHover] = useState<Dot | null>(null);

  const { dots, r2, rMax, axisMax, H, baseline, dotR } = useMemo(() => {
    const { films, r2 } = computeResiduals(filtered, byId);
    if (films.length === 0)
      return {
        dots: [] as Dot[], r2: 0, rMax: 25, axisMax: 30, H: 240, baseline: 200, dotR: 3,
      };

    let rMax = 10;
    for (const f of films) rMax = Math.max(rMax, Math.abs(f.residual));
    rMax = Math.ceil(rMax / BIN) * BIN;

    // Bin index counts half-stars from the centre, so bin 0 is "agreed with the
    // critics" and bin +1 is "half a star above". nBins is odd: a zero column
    // plus a symmetric fan either side.
    const half = rMax / BIN;
    const nBins = 2 * half + 1;
    const binW = (W - ML - MR) / nBins;
    const bins: FilmResidual[][] = Array.from({ length: nBins }, () => []);
    for (const f of films) {
      const i = Math.max(0, Math.min(nBins - 1, Math.round(f.residual / BIN) + half));
      bins[i].push(f);
    }
    // Dots pack into a grid inside each column, grouped by genre so a column
    // reads as ordered colour bands rather than confetti.
    for (const b of bins)
      b.sort(
        (a, c) =>
          primaryGenre(byId.get(a.tmdb_id)).localeCompare(primaryGenre(byId.get(c.tmdb_id))) ||
          a.residual - c.residual,
      );

    // Dots pack into a GRID within each column, not a single file. Half-star bins
    // are wide, and one-dot-per-row would make the modal column hundreds of pixels
    // tall; filling the available width first keeps the chart readable while a
    // stack's area still reads as its count.
    const maxStack = bins.reduce((m, b) => Math.max(m, b.length), 1);
    const r = Math.max(2.2, Math.min(3.4, binW / 2 - 0.5));
    const cell = 2 * r;
    const perRow = Math.max(1, Math.floor((binW - 2) / cell));
    const maxRows = Math.ceil(maxStack / perRow);
    const H = MT + maxRows * cell + MB;
    const baseline = H - MB;

    // The axis domain is padded by half a bin either side so the outermost
    // columns sit fully on canvas rather than straddling the edge.
    const axisMax = rMax + BIN / 2;

    const dots: Dot[] = [];
    bins.forEach((b, i) => {
      // Column centre derived from its VALUE, using the same mapping as the axis
      // ticks, so a column can never drift from the label beneath it.
      const value = (i - half) * BIN;
      const centre = ML + ((value + axisMax) / (2 * axisMax)) * (W - ML - MR);
      // Grid is centred on the column, so the stack stays visually anchored to
      // its tick even when the top row is partly filled.
      const gridLeft = centre - (Math.min(b.length, perRow) * cell) / 2;
      b.forEach((f, k) => {
        const film = byId.get(f.tmdb_id);
        const row = Math.floor(k / perRow);
        const col = k % perRow;
        dots.push({
          ...f,
          genre: primaryGenre(film),
          title: film?.title ?? String(f.tmdb_id),
          year: film?.year ?? null,
          cx: gridLeft + (col + 0.5) * cell,
          cy: baseline - (row + 0.5) * cell,
        });
      });
    });
    return { dots, r2, rMax, axisMax, H, baseline, dotR: r };
  }, [filtered, byId]);

  const { rect, handlers } = useDragRect(
    () => ({ w: W, h: H }),
    (r) => {
      const ids = new Set<number>();
      for (const d of dots) if (rectContains(r, d.cx, d.cy)) ids.add(d.tmdb_id);
      const keys = new Set<string>();
      for (const w of filtered) if (ids.has(w.tmdb_id)) keys.add(watchKey(w));
      setSelection(keys);
    },
  );

  if (dots.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#67655f]">
        Not enough rated films with critic scores.
      </div>
    );
  }

  const hasSel = selectedId != null;
  const xOfValue = (v: number) => ML + ((v + axisMax) / (2 * axisMax)) * (W - ML - MR);
  const ticks: number[] = [];
  for (let v = -rMax; v <= rMax; v += 10) ticks.push(v);
  const pct = Math.round(r2 * 100);

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Every film stacked by how far my rating deviates from the critic-based prediction. Drag to brush a selection."
        {...handlers}
      >
        <line x1={ML} y1={baseline} x2={W - MR} y2={baseline} stroke={INK.axis} strokeWidth={1.5} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={xOfValue(v)} y1={baseline} x2={xOfValue(v)} y2={baseline + 4} stroke={INK.axis} strokeWidth={1} />
            <text x={xOfValue(v)} y={baseline + 16} fill={INK.muted} fontSize={11} textAnchor="middle">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        <line
          x1={xOfValue(0)}
          y1={MT}
          x2={xOfValue(0)}
          y2={baseline}
          stroke={INK.axis}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text x={ML} y={baseline + 30} fill={INK.muted} fontSize={11} textAnchor="start">
          ← I liked it less than critics
        </text>
        <text x={W - MR} y={baseline + 30} fill={INK.muted} fontSize={11} textAnchor="end">
          I liked it more →
        </text>

        {dots.map((d) => {
          const sel = d.tmdb_id === selectedId;
          return (
            <circle
              key={d.tmdb_id}
              cx={d.cx}
              cy={d.cy}
              r={sel ? dotR + 1.2 : dotR}
              fill={GENRE_COLORS[d.genre]}
              fillOpacity={sel ? 1 : hasSel ? 0.25 : 0.85}
              stroke={sel ? ACCENT : INK.surface}
              strokeWidth={sel ? 1.5 : 0.4}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSelected(d.tmdb_id)}
            />
          );
        })}

        <BrushRectOverlay rect={rect} />
      </svg>

      <ChartTakeaway>Critics explain {pct}% of my ratings</ChartTakeaway>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${(hover.cx / W) * 100}%`,
            top: `${(hover.cy / H) * 100}%`,
            transform: "translate(-50%, -130%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <div className="font-medium">
            {hover.title}
            {hover.year != null ? ` (${hover.year})` : ""}
          </div>
          <div style={{ color: "#c3c2b7" }}>
            Me {Math.round(hover.me)} · Critic est. {Math.round(hover.predicted)} (
            {hover.residual > 0 ? "+" : ""}
            {Math.round(hover.residual)})
          </div>
          <div style={{ color: "#c3c2b7", fontSize: "10px" }}>
            MC {hover.metascore} · RT {hover.rt_rating} · IMDB {hover.imdb_rating}
          </div>
        </div>
      )}
    </figure>
  );
}
