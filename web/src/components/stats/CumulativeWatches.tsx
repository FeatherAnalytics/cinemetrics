"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { ceilTo, GENRE_ALPHA, monthSpan, ticksEvery } from "@/lib/statsChart";
import { useWidth } from "@/lib/useWidth";

const W0 = 720;
const W_MIN = 300;
const H = 260;
const ML = 44;
const MB = 24;
const FADE = "#b3b1a6";

type Band = { key: string; color: string; running: number[] };

/**
 * Watches accumulated over time, as stacked bands.
 *
 * Where a rate chart is noisy because daily counts are almost all 0 or 1, this
 * shows total: the slope carries the rate and the band thickness carries
 * composition, so a binge reads as a steepening and needs no smoothing decision.
 *
 * The breakdown FOLLOWS THE FILTER. Unfiltered it stacks by genre. With a filter
 * active it collapses to two bands, the matching watches against everything
 * else, so the chart answers the question the filter just asked instead of
 * redrawing the same six genres with most of them empty. The "other" band is the
 * chrome gray companion to the accent, never a genre color, so it cannot be
 * misread as a category of its own.
 */
export function CumulativeWatches() {
  const { all, filtered, filters } = useExplorer();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth(W0, W_MIN);

  const model = useMemo(() => {
    const months = monthSpan(all.map((w) => w.date));
    if (!months.length) return null;
    const idx = new Map(months.map((m, i) => [m, i]));
    const isFiltered = filtered.length !== all.length;

    const bands: Band[] = [];
    // Names the actual thing being compared when it can: "Horror vs other"
    // rather than the abstract "matching the current filter".
    const only = filters.genres.size === 1 ? [...filters.genres][0] : null;
    if (isFiltered) {
      const keep = new Set(filtered);
      bands.push(
        {
          key: only ? only.toLowerCase() : "selected",
          color: only ? GENRE_COLORS[only] : ACCENT,
          running: Array(months.length).fill(0),
        },
        { key: "other", color: FADE, running: Array(months.length).fill(0) },
      );
      for (const w of all) {
        const i = idx.get(w.date.slice(0, 7));
        if (i == null) continue;
        bands[keep.has(w) ? 0 : 1].running[i] += 1;
      }
    } else {
      for (const g of GENRE_ALPHA) {
        bands.push({
          key: g.toLowerCase(),
          color: GENRE_COLORS[g],
          running: Array(months.length).fill(0),
        });
      }
      const slot = new Map<GenreKey, number>(GENRE_ALPHA.map((g, i) => [g, i]));
      for (const w of all) {
        const i = idx.get(w.date.slice(0, 7));
        if (i == null) continue;
        bands[slot.get(primaryGenre(w.film))!].running[i] += 1;
      }
    }

    for (const b of bands) {
      for (let i = 1; i < b.running.length; i++) b.running[i] += b.running[i - 1];
    }
    const live = bands.filter((b) => b.running[b.running.length - 1] > 0);
    const total = live.reduce((s, b) => s + b.running[b.running.length - 1], 0);
    return { months, bands: live, total, isFiltered };
  }, [all, filtered, filters.genres]);

  if (!model) return null;
  const { months, bands, total, isFiltered } = model;

  // Round hundreds, not proportions of the total: an axis reading 199/397/596 is
  // arithmetic the reader should not have to do.
  const TICK_STEP = 100;
  const scaleMax = Math.max(ceilTo(total, TICK_STEP), TICK_STEP);

  const x = (i: number) => ML + (i / Math.max(months.length - 1, 1)) * (W - ML - 12);
  const y = (v: number) => H - MB - (v / scaleMax) * (H - MB - 12);

  // Each band is a closed polygon between its lower and upper edges.
  const polys: { key: string; color: string; points: string; end: number; at: number }[] = [];
  const floor = Array(months.length).fill(0) as number[];
  const at = hover ?? months.length - 1;
  for (const b of bands) {
    const upper = b.running.map((v, i) => floor[i] + v);
    const points = [
      ...upper.map((v, i) => `${x(i)},${y(v)}`),
      ...floor.map((_, i) => `${x(months.length - 1 - i)},${y(floor[months.length - 1 - i])}`),
    ].join(" ");
    polys.push({
      key: b.key,
      color: b.color,
      points,
      end: b.running[b.running.length - 1],
      at: b.running[at],
    });
    for (let i = 0; i < floor.length; i++) floor[i] = upper[i];
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < ML || px > W - 12) return setHover(null);
    const i = Math.round(((px - ML) / (W - ML - 12)) * (months.length - 1));
    setHover(Math.min(months.length - 1, Math.max(0, i)));
  };

  return (
    <div ref={ref}>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        {isFiltered ? `${bands[0].key} vs other` : "all films"}
      </div>
      <svg
        width={W}
        height={H}
        role="img"
        style={{ maxWidth: "100%" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticksEvery(scaleMax, TICK_STEP).map((v) => (
          <g key={v}>
            <line x1={ML} y1={y(v)} x2={W - 12} y2={y(v)} stroke="#eee" />
            <text x={ML - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>
              {v}
            </text>
          </g>
        ))}
        {polys.map((p) => (
          <polygon key={p.key} points={p.points} fill={p.color} opacity={0.85} />
        ))}
        {hover != null && (
          <line x1={x(hover)} y1={0} x2={x(hover)} y2={H - MB} stroke={INK.primary} strokeWidth={0.75} />
        )}
        {months.map((m, i) =>
          m.endsWith("-01") ? (
            <text key={m} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={INK.muted}>
              {m.slice(0, 4)}
            </text>
          ) : null,
        )}
      </svg>
      {/* Legend numbers track the hover, so it reads each band AT that month
          rather than only ever showing the final total the chart already draws. */}
      <div className="mt-1 flex flex-wrap gap-3 font-mono text-[10px]" style={{ color: INK.muted }}>
        <span style={{ color: INK.primary }}>{hover != null ? months[hover] : "total"}</span>
        {/* Legend order matches the stacking order (alphabetical), not the
            current values: a legend that resorts as you hover makes the reader
            re-find each genre on every move. */}
        {polys.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2" style={{ background: p.color }} />
              {p.key} {p.at}
            </span>
          ))}
      </div>
    </div>
  );
}
