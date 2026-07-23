"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { watchKey } from "@/lib/brush";
import { computeResiduals } from "@/lib/stats";

const LABEL_W = 200;
const BAR_W = 400;
const VALUE_W = 50;
const WIDTH = LABEL_W + BAR_W + VALUE_W;
const BAR_H = 24;
const GAP = 4;
const MIN_FILMS = 10;
const TOP_N = 8;

type KeywordBar = {
  keyword: string;
  avgResidual: number;
  count: number;
  genre: GenreKey;
  filmIds: Set<number>;
};

export function KeywordBars() {
  const { filtered, byId, setSelection } = useExplorer();
  const [hover, setHover] = useState<string | null>(null);

  const bars = useMemo<KeywordBar[]>(() => {
    const { films } = computeResiduals(filtered, byId);
    if (films.length === 0) return [];

    const kwMap = new Map<
      string,
      { residuals: number[]; genres: GenreKey[]; ids: Set<number> }
    >();

    for (const f of films) {
      const film = byId.get(f.tmdb_id);
      if (!film) continue;

      const kws = film.keywords;
      const genre = primaryGenre(film);

      for (const kw of kws) {
        if (!kwMap.has(kw)) kwMap.set(kw, { residuals: [], genres: [], ids: new Set() });
        const entry = kwMap.get(kw)!;
        entry.residuals.push(f.residual);
        entry.genres.push(genre);
        entry.ids.add(f.tmdb_id);
      }
    }

    const candidates: KeywordBar[] = [];
    for (const [kw, data] of kwMap) {
      if (data.residuals.length < MIN_FILMS) continue;

      const avgResidual = data.residuals.reduce((a, b) => a + b, 0) / data.residuals.length;

      // Dominant genre: most common
      const genreCounts = new Map<GenreKey, number>();
      for (const g of data.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      let dominantGenre: GenreKey = "Other";
      let maxCount = 0;
      for (const [g, count] of genreCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantGenre = g;
        }
      }

      candidates.push({
        keyword: kw,
        avgResidual,
        count: data.residuals.length,
        genre: dominantGenre,
        filmIds: data.ids,
      });
    }

    // Sort by avg residual
    candidates.sort((a, b) => a.avgResidual - b.avgResidual);

    // When fewer than 2*TOP_N, just show all sorted
    if (candidates.length <= TOP_N * 2) return candidates;

    // Take bottom N + top N (no overlap possible)
    const bottom = candidates.slice(0, TOP_N);
    const top = candidates.slice(-TOP_N);

    return [...bottom, ...top];
  }, [filtered, byId]);

  const maxAbs = useMemo(() => {
    if (bars.length === 0) return 10;
    return Math.max(...bars.map((b) => Math.abs(b.avgResidual)));
  }, [bars]);

  const HEIGHT = bars.length * (BAR_H + GAP) + 40;

  if (bars.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#67655f]">
        Not enough data for keyword analysis.
      </div>
    );
  }

  const zeroX = LABEL_W + BAR_W / 2;

  const handleClick = (bar: KeywordBar) => {
    const keys = new Set<string>();
    for (const w of filtered) {
      if (bar.filmIds.has(w.tmdb_id)) keys.add(watchKey(w));
    }
    setSelection(keys);
  };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Keywords with highest and lowest average residual ratings"
      >
        {/* Zero line */}
        <line x1={zeroX} y1={20} x2={zeroX} y2={HEIGHT - 20} stroke={INK.axis} strokeWidth={1.5} />

        {bars.map((bar, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const barLen = (Math.abs(bar.avgResidual) / maxAbs) * (BAR_W / 2 - 10);
          const barX = bar.avgResidual > 0 ? zeroX : zeroX - barLen;
          const isHover = hover === bar.keyword;

          return (
            <g key={bar.keyword}>
              {/* Label */}
              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={INK.secondary}
                fontSize={12}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {bar.keyword}
              </text>

              {/* Bar */}
              <rect
                x={barX}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={GENRE_COLORS[bar.genre]}
                fillOpacity={isHover ? 0.9 : 0.72}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(bar.keyword)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleClick(bar)}
              />

              {/* Value label — inside bar if wide enough, outside if narrow */}
              {(() => {
                const inside = barLen > 40;
                const lx = inside
                  ? (bar.avgResidual > 0 ? zeroX + 6 : zeroX - 6)
                  : (bar.avgResidual > 0 ? zeroX + barLen + 6 : zeroX - barLen - 6);
                return (
                  <text
                    x={lx}
                    y={y + BAR_H / 2}
                    fill={inside ? INK.surface : INK.primary}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={bar.avgResidual > 0 ? "start" : "end"}
                    dominantBaseline="middle"
                  >
                    {bar.avgResidual > 0 ? "+" : ""}
                    {bar.avgResidual.toFixed(1)}
                  </text>
                );
              })()}

              {/* Tooltip */}
              {isHover && (
                <>
                  <rect
                    x={LABEL_W + BAR_W + VALUE_W + 10}
                    y={y - 10}
                    width={240}
                    height={BAR_H + 20}
                    fill={INK.primary}
                    rx={4}
                  />
                  <text
                    x={LABEL_W + BAR_W + VALUE_W + 20}
                    y={y + BAR_H / 2}
                    fill={INK.surface}
                    fontSize={11}
                    dominantBaseline="middle"
                  >
                    {bar.count} films tagged &lsquo;{bar.keyword}&rsquo; · avg residual{" "}
                    {bar.avgResidual > 0 ? "+" : ""}
                    {bar.avgResidual.toFixed(1)} · {bar.genre}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b8981]">
        keywords appearing in {MIN_FILMS}+ rated films
      </figcaption>
    </figure>
  );
}
