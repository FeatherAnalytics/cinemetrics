"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { watchKey } from "@/lib/brush";
import { computeResiduals } from "@/lib/stats";
import { BAR_H, GAP } from "@/lib/barChart";
import { ChartTakeaway } from "./ChartTakeaway";
import { heartByFilm, heartDeltaPP, ppLabel } from "@/lib/heartLens";

const LABEL_W = 200;
const BAR_W = 400;
const VALUE_W = 50;
const WIDTH = LABEL_W + BAR_W + VALUE_W;
const MIN_FILMS = 10;
const TOP_N = 8;

type KeywordBar = {
  keyword: string;
  /** Heart rate minus my overall rate, in points. Null below the evidence floor. */
  heartDelta: number | null;
  count: number;
  /** Films under this keyword whose heart is known. The heart denominator. */
  heartCount: number;
  genre: GenreKey;
  filmIds: Set<number>;
};

export function KeywordBars() {
  const { all, filtered, byId, setSelection } = useExplorer();
  const [hover, setHover] = useState<string | null>(null);

  const hearts = useMemo(() => heartByFilm(all), [all]);

  const bars = useMemo<KeywordBar[]>(() => {
    const { films } = computeResiduals(filtered, byId);
    if (films.length === 0) return [];

    // The baseline every keyword is measured against: my heart rate across the
    // films actually in view, so the deviation moves with the rail.
    let baseLiked = 0;
    let baseKnown = 0;
    for (const f of films) {
      const h = hearts.get(f.tmdb_id);
      if (h == null) continue;
      baseKnown += 1;
      if (h) baseLiked += 1;
    }
    const baseRate = baseKnown > 0 ? baseLiked / baseKnown : null;

    const kwMap = new Map<
      string,
      { residuals: number[]; genres: GenreKey[]; ids: Set<number>; hearts: boolean[] }
    >();

    for (const f of films) {
      const film = byId.get(f.tmdb_id);
      if (!film) continue;

      const kws = film.keywords;
      const genre = primaryGenre(film);

      for (const kw of kws) {
        if (!kwMap.has(kw))
          kwMap.set(kw, { residuals: [], genres: [], ids: new Set(), hearts: [] });
        const entry = kwMap.get(kw)!;
        entry.residuals.push(f.residual);
        entry.genres.push(genre);
        entry.ids.add(f.tmdb_id);
        const h = hearts.get(f.tmdb_id);
        if (h != null) entry.hearts.push(h);
      }
    }

    const candidates: KeywordBar[] = [];
    for (const [kw, data] of kwMap) {
      if (data.residuals.length < MIN_FILMS) continue;

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

      // Suppressed below MIN_FILMS of KNOWN heart, which is a different count than
      // the film count above: a keyword can clear the film floor on films that all
      // predate the heart, and 0% of nothing is not a finding.
      const heartDelta =
        baseRate != null && data.hearts.length >= MIN_FILMS
          ? heartDeltaPP(
              data.hearts.filter(Boolean).length / data.hearts.length,
              baseRate,
            )
          : null;

      candidates.push({
        keyword: kw,
        heartDelta,
        count: data.residuals.length,
        heartCount: data.hearts.length,
        genre: dominantGenre,
        filmIds: data.ids,
      });
    }

    // Sorted by the heart deviation, strongest positive first, so the chart reads
    // top to bottom from "I heart these more often than I heart anything" down to
    // less often. Keywords with no measurable deviation leave rather than piling up
    // at whichever end null happens to sort to.
    const ranked = candidates.filter((c) => c.heartDelta != null);
    ranked.sort((a, b) => b.heartDelta! - a.heartDelta!);

    // When fewer than 2*TOP_N, just show all sorted
    if (ranked.length <= TOP_N * 2) return ranked;

    // Take top N + bottom N (no overlap possible)
    return [...ranked.slice(0, TOP_N), ...ranked.slice(-TOP_N)];
  }, [filtered, byId, hearts]);

  // Bars are filtered to a measurable delta above, so the fallback never fires.
  const valueOf = (b: KeywordBar) => b.heartDelta ?? 0;
  const maxAbs = useMemo(() => {
    if (bars.length === 0) return 10;
    return Math.max(...bars.map((b) => Math.abs(valueOf(b))));
  }, [bars]);

  const HEIGHT = bars.length * (BAR_H + GAP) + 40;

  if (bars.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        Not enough data for keyword analysis: it needs a keyword shared by{" "}
        {MIN_FILMS}+ rated films. Widen the filters to bring more films in.
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
        aria-label="Keywords whose heart rate sits furthest above and below my overall heart rate"
      >
        {/* Zero line */}
        <line x1={zeroX} y1={20} x2={zeroX} y2={HEIGHT - 20} stroke={INK.axis} strokeWidth={1.5} />

        {bars.map((bar, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const value = valueOf(bar);
          const barLen = (Math.abs(value) / maxAbs) * (BAR_W / 2 - 10);
          const barX = value > 0 ? zeroX : zeroX - barLen;
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

              {/* The value sits across the zero line from its own bar, hugging
                  the line. Bar and number never share space, so the number
                  always reads in primary ink instead of switching to pale
                  whenever a bar got long enough to sit under it. The empty
                  half of each row is where the eye already is. */}
              <text
                x={value > 0 ? zeroX - 6 : zeroX + 6}
                y={y + BAR_H / 2}
                fill={INK.primary}
                fontSize={11}
                fontWeight={700}
                textAnchor={value > 0 ? "end" : "start"}
                dominantBaseline="middle"
              >
                {ppLabel(value)}
              </text>

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
                    {bar.heartCount} films tagged &lsquo;{bar.keyword}&rsquo; · 
                    {ppLabel(value)} vs my overall heart rate · {bar.genre}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTakeaway>keywords on {MIN_FILMS}+ films whose heart was recorded</ChartTakeaway>
    </figure>
  );
}
