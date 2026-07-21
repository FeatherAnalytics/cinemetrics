"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { rectContains, useDragRect, watchKey } from "@/lib/brush";
import { computeResiduals, type FilmResidual } from "@/lib/stats";

const SIZE = 600;
const M = 48;
const W = SIZE - 2 * M;

type Dot = FilmResidual & { film: GenreKey };

export function ResidualScatter() {
  const { filtered, byId, selectedId, setSelected, setSelection } = useExplorer();
  const [hover, setHover] = useState<{ x: number; y: number; dot: Dot } | null>(null);

  const { dots, r2, xMin, xMax } = useMemo(() => {
    const { films, r2 } = computeResiduals(filtered, byId);
    if (films.length === 0) return { dots: [], r2: 0, xMin: 0, xMax: 100 };

    const predicted = films.map((f) => f.predicted);
    const pMin = Math.min(...predicted);
    const pMax = Math.max(...predicted);
    const pad = 5;

    const enriched = films.map((f) => ({
      ...f,
      film: primaryGenre(byId.get(f.tmdb_id)),
    }));

    return {
      dots: enriched,
      r2,
      xMin: Math.max(0, pMin - pad),
      xMax: Math.min(100, pMax + pad),
    };
  }, [filtered, byId]);

  const xScale = (val: number) => M + ((val - xMin) / (xMax - xMin)) * W;
  const yScale = (val: number) => SIZE - M - (val / 100) * W;

  const hasSel = selectedId != null;
  const ordered = [...dots].sort(
    (a, b) => Number(a.tmdb_id === selectedId) - Number(b.tmdb_id === selectedId),
  );

  // X-axis ticks (predicted rating)
  const xTicks = [];
  const xStep = 20;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    xTicks.push(x);
  }

  // Y-axis ticks (my rating)
  const yTicks = [0, 20, 40, 60, 80, 100];

  // Diagonal line: y = x in data space
  const diagStart = { x: xScale(xMin), y: yScale(xMin) };
  const diagEnd = { x: xScale(xMax), y: yScale(xMax) };

  const { rect, handlers } = useDragRect(
    () => ({ w: SIZE, h: SIZE }),
    (r) => {
      const ids = new Set<number>();
      for (const d of dots) {
        const x = xScale(d.predicted);
        const y = yScale(d.me);
        if (rectContains(r, x, y)) ids.add(d.tmdb_id);
      }
      const keys = new Set<string>();
      for (const w of filtered) if (ids.has(w.tmdb_id)) keys.add(watchKey(w));
      setSelection(keys);
    },
  );

  const pct = Math.round(r2 * 100);

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full"
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Predicted rating vs my actual rating. Drag to brush a selection."
        {...handlers}
      >
        {/* Grid lines */}
        {xTicks.map((x) => (
          <line
            key={`x${x}`}
            x1={xScale(x)}
            y1={M}
            x2={xScale(x)}
            y2={SIZE - M}
            stroke={INK.grid}
            strokeWidth={0.5}
          />
        ))}
        {yTicks.map((y) => (
          <line
            key={`y${y}`}
            x1={M}
            y1={yScale(y)}
            x2={SIZE - M}
            y2={yScale(y)}
            stroke={INK.grid}
            strokeWidth={0.5}
          />
        ))}

        {/* Axes */}
        <line x1={M} y1={M} x2={M} y2={SIZE - M} stroke={INK.axis} strokeWidth={1.5} />
        <line x1={M} y1={SIZE - M} x2={SIZE - M} y2={SIZE - M} stroke={INK.axis} strokeWidth={1.5} />

        {/* Axis labels */}
        <text x={SIZE / 2} y={SIZE - 12} fill={INK.secondary} fontSize={12} textAnchor="middle">
          predicted rating
        </text>
        <text
          x={12}
          y={SIZE / 2}
          fill={INK.secondary}
          fontSize={12}
          textAnchor="middle"
          transform={`rotate(-90 12 ${SIZE / 2})`}
        >
          my rating
        </text>

        {/* Tick labels */}
        {xTicks.map((x) => (
          <text
            key={`xl${x}`}
            x={xScale(x)}
            y={SIZE - M + 16}
            fill={INK.muted}
            fontSize={11}
            textAnchor="middle"
          >
            {x}
          </text>
        ))}
        {yTicks.map((y) => (
          <text
            key={`yl${y}`}
            x={M - 8}
            y={yScale(y)}
            fill={INK.muted}
            fontSize={11}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {y}
          </text>
        ))}

        {/* Diagonal reference line (y = x) */}
        <line
          x1={diagStart.x}
          y1={diagStart.y}
          x2={diagEnd.x}
          y2={diagEnd.y}
          stroke={INK.axis}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {/* Dots */}
        {ordered.map((d) => {
          const x = xScale(d.predicted);
          const y = yScale(d.me);
          const sel = d.tmdb_id === selectedId;
          return (
            <circle
              key={d.tmdb_id}
              cx={x}
              cy={y}
              r={sel ? 6 : 4}
              fill={GENRE_COLORS[d.film]}
              fillOpacity={sel ? 1 : hasSel ? 0.25 : 0.72}
              stroke={sel ? ACCENT : INK.surface}
              strokeWidth={sel ? 2 : 0.75}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover({ x, y, dot: d })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSelected(d.tmdb_id)}
            />
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

      <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b8981]">
        Critics explain {pct}% of my ratings
      </p>

      {hover && (() => {
        const hf = byId.get(hover.dot.tmdb_id);
        return (
          <div
            className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
            style={{
              left: `${(hover.x / SIZE) * 100}%`,
              top: `${(hover.y / SIZE) * 100}%`,
              transform: "translate(-50%, -130%)",
              background: INK.primary,
              color: INK.surface,
            }}
          >
            <div className="font-medium">
              {hf?.title}
              {hf?.year != null ? ` (${hf.year})` : ""}
            </div>
            <div style={{ color: "#c3c2b7" }}>
              Me {Math.round(hover.dot.me)} · Predicted {Math.round(hover.dot.predicted)} (
              <span style={{ color: GENRE_COLORS[hover.dot.film] }}>
                {hover.dot.residual > 0 ? "+" : ""}
                {Math.round(hover.dot.residual)}
              </span>
              )
            </div>
            <div style={{ color: "#c3c2b7", fontSize: "10px" }}>
              MC {hover.dot.metascore} · RT {hover.dot.rt_rating} · IMDB {hover.dot.imdb_rating}
            </div>
          </div>
        );
      })()}
    </figure>
  );
}
