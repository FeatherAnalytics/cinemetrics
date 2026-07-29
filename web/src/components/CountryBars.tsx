"use client";

import { useMemo, useState } from "react";
import { useExplorer, filterWatches } from "@/lib/store";
import { GENRE_COLORS, INK, UI } from "@/lib/palette";
import { countryName } from "@/lib/countries";
import { languageName } from "@/lib/languages";
import { aggregateOrigin, type CountryRow, type OriginDimension } from "@/lib/countryStats";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { ChartTakeaway } from "./ChartTakeaway";
import { Toggle } from "./stats/Toggle";
import { heartDeltaPP, heartShare, ppLabel } from "@/lib/heartLens";

const DIMENSIONS = ["country", "language"] as const;

const LABEL_W = 176;
const BAR_W = 286; // films track, grows left to right
const DEV_W = 226; // deviation track, signed, growing both ways from its own zero
const WIDTH = LABEL_W + BAR_W + DEV_W;
/**
 * The zero of the deviation track, at its center.
 *
 * The track USED to be anchored at the right edge with bars growing leftward, so
 * the two series converged instead of diverging from a spine. That was right when
 * the value was a magnitude with its sign in the label. It is wrong now: the
 * statistic is signed, and a chart where +42% and −18% both grow the same way
 * forces the reader to check every label to know which direction a row went. A
 * zero line costs one mark and makes the sign readable at a glance, the way the
 * keyword chart already does it.
 */
const DEV_ZERO = LABEL_W + BAR_W + DEV_W / 2;
// Half the track, less room for a value label outside the longest bar at either end.
const DEV_HALF = DEV_W / 2 - 26;
const TOP_N = 15;
// Below this length a value label will not fit inside its bar and sits outside.
const INSIDE_MIN = 44;

export function CountryBars() {
  const { all, byId, filters, setCountry, setLanguage } = useExplorer();
  const [hover, setHover] = useState<string | null>(null);
  const [dimension, setDimension] = useState<OriginDimension>("country");
  const isLang = dimension === "language";

  // Aggregate over every filter EXCEPT the one this chart sets, so selecting a
  // row still leaves the rest of the ranking visible (self-excluding
  // cross-filter, same as the archived world map). Which filter that is now
  // follows the toggle: in language mode the country filter stays applied and
  // the language one lifts.
  const watches = useMemo(
    () =>
      filterWatches(all, {
        ...filters,
        ...(isLang ? { language: null } : { country: null }),
      }),
    [all, filters, isLang],
  );
  const agg = useMemo(
    () => aggregateOrigin(watches, byId, dimension, TOP_N),
    [watches, byId, dimension],
  );

  const label = (key: string) => (isLang ? languageName(key) : countryName(key));
  const active = isLang ? filters.language : filters.country;
  const pick = isLang ? setLanguage : setCountry;

  // The mirror is how far that country's heart rate sits from my overall one, and
  // it is no longer conditional: the me-versus-critics residual it replaced asked
  // what the critics thought, which is a different chart's question and was the one
  // number here that said nothing about me. Stated as a deviation and not a bare
  // rate because the bar diverges from an anchor, and because 46% means nothing
  // until you know the baseline is 47%.
  const heartRates = useMemo(() => {
    // The baseline is the whole filtered view, so it moves with the rail: a
    // deviation against a fixed 47% would be measured off films not on screen.
    const base = heartShare(watches, 1);
    if (!base) return null;
    const out = new Map<string, number>();
    for (const row of agg.rows) {
      // Membership follows the toggle, so the deviation is measured off the same
      // films the bar beside it counts. Reading country membership while the
      // chart ranked languages would put one row's rate against another's count.
      const share = heartShare(
        watches.filter((w) =>
          isLang
            ? w.film?.language === row.iso
            : (w.film?.production_countries ?? []).includes(row.iso),
        ),
      );
      if (share) out.set(row.iso, heartDeltaPP(share.rate, base.rate));
    }
    return out;
  }, [agg.rows, watches, isLang]);

  const maxCount = agg.rows.reduce((m, r) => Math.max(m, r.count), 1);
  const tailRow = agg.tailCountries > 0;

  // Furthest from my baseline either way, measured rather than asserted.
  const topHeart = [...(heartRates?.entries() ?? [])].reduce<
    { iso: string; pp: number } | null
  >(
    (best, [iso, pp]) => (best == null || Math.abs(pp) > Math.abs(best.pp) ? { iso, pp } : best),
    null,
  );

  // Scaled against its own maximum, so the longest deviation fills the track.
  const devMax = Math.max(0.1, ...[...(heartRates?.values() ?? [])].map(Math.abs));

  const HEIGHT = (agg.rows.length + (tailRow ? 1 : 0)) * (BAR_H + GAP) + 40;

  if (agg.rows.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#67655f]">
        No films match the current filters.
      </div>
    );
  }

  const handleRow = (row: CountryRow) => pick(row.iso);

  return (
    <figure className="m-0">
      <div className="mb-2">
        <Toggle
          options={DIMENSIONS}
          value={dimension}
          onChange={setDimension}
          label="Origin dimension"
        />
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Top production ${
          isLang ? "languages" : "countries"
        } ranked by film count, colored by dominant genre. Film bars grow rightward from the name. The right-hand track diverges from a zero line: bars grow right where I heart films from that ${dimension} more often than average and left where less often.`}
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
        {/* Centered on the zero it labels, rather than parked at the track's right
            edge, which now describes only the positive half. */}
        <text
          x={DEV_ZERO}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
        >
          HEART RATE vs MINE
        </text>

        <line
          x1={DEV_ZERO}
          y1={20}
          x2={DEV_ZERO}
          y2={HEIGHT - 20}
          stroke={INK.axis}
          strokeWidth={1.5}
        />

        {agg.rows.map((row, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const barLen = (row.count / maxCount) * BAR_W;
          const sel = active === row.iso;
          const dim = active != null && !sel;
          const isHover = hover === row.iso;
          const countInside = barLen > INSIDE_MIN;
          const dev = heartRates?.get(row.iso) ?? null;
          const devLen = dev == null ? 0 : (Math.abs(dev) / devMax) * DEV_HALF;
          // Grows right when I heart that country more often than average, left when
          // less, from a shared zero.
          const devX = dev != null && dev > 0 ? DEV_ZERO : DEV_ZERO - devLen;
          const devInside = devLen > INSIDE_MIN;
          const name = label(row.iso);

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
                stroke={sel ? UI.selected : "none"}
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

              {/* The heart deviation, when enough films recorded one. Same fill as the
                  films bar, so a row reads as one country in one color; the DIRECTION
                  carries the sign, which is what the old right-anchored version made
                  the reader read off the label instead. */}
              {dev != null && (
                <>
                  <rect
                    x={devX}
                    y={y}
                    width={devLen}
                    height={BAR_H}
                    fill={GENRE_COLORS[row.genre]}
                    fillOpacity={isHover || sel ? 0.9 : 0.72}
                    stroke={sel ? UI.selected : "none"}
                    strokeWidth={sel ? 1.75 : 0}
                  />
                  {/* At the growing end of its own bar, whichever way that is, so the
                      label never crosses the zero line and sit on the wrong side of it.
                      Inside the bar when there is room, same weight and fill rule as the
                      film count. */}
                  <text
                    x={
                      dev > 0
                        ? DEV_ZERO + devLen + (devInside ? -6 : 6)
                        : DEV_ZERO - devLen + (devInside ? 6 : -6)
                    }
                    y={y + BAR_H / 2}
                    fill={valueLabelFill(devInside)}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={dev > 0 ? (devInside ? "end" : "start") : devInside ? "start" : "end"}
                    dominantBaseline="middle"
                  >
                    {ppLabel(dev)}
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
            + {agg.tailCountries} more{" "}
            {isLang
              ? agg.tailCountries === 1
                ? "language"
                : "languages"
              : agg.tailCountries === 1
                ? "country"
                : "countries"}{" "}
            ·{" "}
            {agg.tailFilms} film{agg.tailFilms === 1 ? "" : "s"}
          </text>
        )}
      </svg>
      {topHeart && (
        <ChartTakeaway>
          {agg.totalCountries} {isLang ? "languages" : "countries"} · {label(topHeart.iso)}{" "}
          sits {ppLabel(topHeart.pp)} from my overall heart rate
        </ChartTakeaway>
      )}
    </figure>
  );
}
