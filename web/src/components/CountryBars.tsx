"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK } from "@/lib/palette";
import { countryName } from "@/lib/countries";
import { aggregateCountries, type CountryRow } from "@/lib/countryStats";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { ChartTakeaway } from "./ChartTakeaway";

const LABEL_W = 176;
const BAR_W = 286; // films track, grows left to right
const RESID_W = 226; // residual track, grows right to left
const WIDTH = LABEL_W + BAR_W + RESID_W;
// Where the residual bars are anchored. They grow back toward the films bars, so
// the two series meet in the middle instead of diverging from a central spine.
// No reserved value column: both value labels sit at their own bar's end, which
// is what buys the extra track width.
const RESID_ORIGIN = WIDTH;
const TOP_N = 15;
// Below this length a value label will not fit inside its bar and sits outside.
const INSIDE_MIN = 44;

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
  const maxResid = agg.rows.reduce((m, r) => Math.max(m, Math.abs(r.residual ?? 0)), 0.1);
  const tailRow = agg.tailCountries > 0;

  // Strongest finding among the ranked countries: the biggest deviation from
  // prediction (only rows with enough films to have a residual).
  const strongest = agg.rows
    .filter((r) => r.residual != null)
    .reduce<CountryRow | null>(
      (best, r) => (best == null || Math.abs(r.residual!) > Math.abs(best.residual!) ? r : best),
      null,
    );
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

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Top production countries ranked by film count, coloured by dominant genre. Films bars grow rightward from the country name; mirrored bars grow leftward from the right edge showing how far my average rating sits from the critic estimate."
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
          x={RESID_ORIGIN}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          ME − CRITIC EST.
        </text>

        {agg.rows.map((row, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const barLen = (row.count / maxCount) * BAR_W;
          const sel = filters.country === row.iso;
          const dim = filters.country != null && !sel;
          const isHover = hover === row.iso;
          const countInside = barLen > INSIDE_MIN;
          const residLen =
            row.residual != null ? (Math.abs(row.residual) / maxResid) * RESID_W : 0;
          const residInside = residLen > INSIDE_MIN;
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
                fill={valueLabelFill(countInside)}
                fontSize={11}
                fontWeight={700}
                textAnchor={countInside ? "end" : "start"}
                dominantBaseline="middle"
              >
                {row.count}
              </text>

              {/* Mean residual vs prediction, when enough films to be meaningful.
                  Mirrors the films bar: same fill, opposite direction, anchored at
                  the right so the pair converges. Magnitude only; the sign lives in
                  the label rather than in a second colour. */}
              {row.residual != null && (
                <>
                  <rect
                    x={RESID_ORIGIN - residLen}
                    y={y}
                    width={residLen}
                    height={BAR_H}
                    fill={GENRE_COLORS[row.genre]}
                    fillOpacity={isHover || sel ? 0.9 : 0.72}
                    stroke={sel ? ACCENT : "none"}
                    strokeWidth={sel ? 1.75 : 0}
                  />
                  {/* Mirrors the film-count label: at the growing end of its own
                      bar, inside when there is room, same weight and fill rule. */}
                  <text
                    x={RESID_ORIGIN - residLen + (residInside ? 6 : -6)}
                    y={y + BAR_H / 2}
                    fill={valueLabelFill(residInside)}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={residInside ? "start" : "end"}
                    dominantBaseline="middle"
                  >
                    {fmtResidual(row.residual)}
                  </text>
                </>
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
      {strongest && (
        <ChartTakeaway>
          {agg.totalCountries} countries · I rate {countryName(strongest.iso)}{" "}
          {fmtResidual(strongest.residual!)} vs critic est.
        </ChartTakeaway>
      )}
    </figure>
  );
}
