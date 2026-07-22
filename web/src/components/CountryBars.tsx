"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK } from "@/lib/palette";
import { countryName } from "@/lib/countries";
import { aggregateCountries, type CountryRow } from "@/lib/countryStats";

const LABEL_W = 200;
const BAR_W = 360;
const VALUE_W = 90;
const WIDTH = LABEL_W + BAR_W + VALUE_W;
const BAR_H = 24;
const GAP = 4;
const TOP_N = 15;

export function CountryBars() {
  const { all, byId, filters, setCountry } = useExplorer();
  const [hover, setHover] = useState<string | null>(null);

  // Aggregate over every filter EXCEPT country, so selecting a country still
  // leaves the rest of the ranking visible (self-excluding cross-filter, same
  // as the archived world map).
  const agg = useMemo(() => {
    const watches = filterWatches(all, { ...filters, country: null });
    return aggregateCountries(watches, byId, TOP_N);
  }, [all, byId, filters]);

  const maxCount = agg.rows.reduce((m, r) => Math.max(m, r.count), 1);
  const tailRow = agg.tailCountries > 0;
  const HEIGHT = (agg.rows.length + (tailRow ? 1 : 0)) * (BAR_H + GAP) + 40;

  if (agg.rows.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#67655f]">
        No films match the current filters.
      </div>
    );
  }

  const fmtResidual = (r: number) => `${r > 0 ? "+" : ""}${r.toFixed(1)}`;

  const handleRow = (row: CountryRow) => setCountry(row.iso);

  const hoverIdx = hover == null ? -1 : agg.rows.findIndex((r) => r.iso === hover);
  const hoverRow = hoverIdx >= 0 ? agg.rows[hoverIdx] : null;

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Top production countries ranked by film count, coloured by dominant genre, with my average rating residual per country"
      >
        {/* Column headers */}
        <text
          x={LABEL_W}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          FILMS
        </text>
        <text
          x={LABEL_W + BAR_W + VALUE_W - 8}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          ME − PREDICTED
        </text>

        {agg.rows.map((row, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const barLen = (row.count / maxCount) * BAR_W;
          const sel = filters.country === row.iso;
          const dim = filters.country != null && !sel;
          const isHover = hover === row.iso;
          const countInside = barLen > 44;
          const name = countryName(row.iso);

          return (
            <g
              key={row.iso}
              style={{ cursor: "pointer" }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(row.iso)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleRow(row)}
            >
              {/* Row hit area, so the whole line is clickable */}
              <rect x={0} y={y} width={WIDTH} height={BAR_H} fill="transparent" />

              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={sel ? INK.primary : INK.secondary}
                fontSize={12}
                fontWeight={sel ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {name}
              </text>

              <rect
                x={LABEL_W}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={GENRE_COLORS[row.genre]}
                fillOpacity={isHover || sel ? 0.9 : 0.72}
                stroke={sel ? ACCENT : "none"}
                strokeWidth={sel ? 1.75 : 0}
              />

              {/* Film count at the end of the bar */}
              <text
                x={countInside ? LABEL_W + barLen - 6 : LABEL_W + barLen + 6}
                y={y + BAR_H / 2}
                fill={countInside ? INK.surface : INK.primary}
                fontSize={11}
                fontWeight={700}
                textAnchor={countInside ? "end" : "start"}
                dominantBaseline="middle"
              >
                {row.count}
              </text>

              {/* Mean residual vs prediction, when enough films to be meaningful */}
              {row.residual != null && (
                <text
                  x={LABEL_W + BAR_W + VALUE_W - 8}
                  y={y + BAR_H / 2}
                  fill={INK.muted}
                  fontSize={11}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {fmtResidual(row.residual)}
                </text>
              )}

            </g>
          );
        })}

        {tailRow && (
          <text
            x={LABEL_W - 8}
            y={20 + agg.rows.length * (BAR_H + GAP) + BAR_H / 2}
            fill={INK.muted}
            fontSize={11}
            textAnchor="end"
            dominantBaseline="middle"
          >
            + {agg.tailCountries} more {agg.tailCountries === 1 ? "country" : "countries"} ·{" "}
            {agg.tailFilms} film{agg.tailFilms === 1 ? "" : "s"}
          </text>
        )}
      </svg>

      {/* HTML tooltip: auto-sizes to its text and always sits above the svg,
          so it can't be undersized or painted over by later bars. */}
      {hoverRow && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${(LABEL_W / WIDTH) * 100}%`,
            top: `${((20 + hoverIdx * (BAR_H + GAP) + BAR_H / 2) / HEIGHT) * 100}%`,
            transform: "translate(-50%, -150%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <span className="font-medium">{countryName(hoverRow.iso)}</span>
          <span style={{ color: "#c3c2b7" }}> · mostly {hoverRow.genre}</span>
        </div>
      )}
    </figure>
  );
}
