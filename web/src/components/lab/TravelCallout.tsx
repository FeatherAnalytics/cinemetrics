"use client";

import { PlaneMarker } from "@/lib/travel";
import { hairline, useTheme } from "@/lib/theme";
import { ratingLabel, ratioLabel, signedLabel, type TravelStats } from "@/lib/travelStats";

/**
 * PROTOTYPE 3. No axes. The trips named, the films listed, the figures inline.
 *
 * The cheapest of the three by a wide margin, and the only one that can say what
 * the films WERE. Ten days holding one to four films each is a list, and a list
 * printed as a list needs no scale, no domain and no y axis to defend.
 *
 * The dart still earns its place here: it is the one part of the finding that is
 * not a number, and it distinguishes the outbound day from the way home without
 * a word of prose.
 */

const LEG_PROSE = {
  depart: "out",
  return: "home",
  level: "between stops",
} as const;

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCDate()}`;
}

export function TravelCallout({ stats }: { stats: TravelStats }) {
  const { tokens } = useTheme();
  const { travel, ordinary } = stats;

  return (
    <div
      className="rounded-sm border-l-2 py-1 pl-4"
      style={{ borderColor: tokens.ink.primary }}
    >
      <p className="text-base leading-relaxed" style={{ color: tokens.ink.primary }}>
        I watch roughly twice as many films on a day I spend flying.{" "}
        {/* Two decimals, matching the other two panels. 2.1 against 1.1 is the same
            claim rounded differently, and three panels rounding one figure three
            ways is exactly what putting them behind one stats module was for. */}
        <span className="font-mono tabular-nums">{travel.filmsPerDay.toFixed(2)}</span> per flight
        day against{" "}
        <span className="font-mono tabular-nums">{ordinary.filmsPerDay.toFixed(2)}</span> on an
        ordinary viewing day ({" "}
        <span className="font-mono">{ratioLabel(stats.filmsPerDayRatio)}</span>) and{" "}
        <span className="font-mono tabular-nums">{travel.multiFilmDays}</span> of the{" "}
        <span className="font-mono tabular-nums">{travel.days}</span> flight days held more than
        one film against{" "}
        <span className="font-mono tabular-nums">
          {Math.round(ordinary.multiFilmShare * 100)}%
        </span>{" "}
        of the rest.
      </p>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: tokens.ink.secondary }}>
        {stats.ratingGapIsNoise ? (
          <>
            What does <em>not</em> change is what I think of them. The flight mean is{" "}
            <span className="font-mono tabular-nums">{ratingLabel(travel.meanRating)}</span>{" "}
            against{" "}
            <span className="font-mono tabular-nums">{ratingLabel(ordinary.meanRating)}</span>, a
            gap of <span className="font-mono">{signedLabel(stats.ratingDiff)}</span> points on{" "}
            <span className="font-mono tabular-nums">{travel.ratingN}</span> watches, smaller than
            the standard error of{" "}
            <span className="font-mono tabular-nums">{ratingLabel(stats.ratingDiffSe)}</span> that
            comes with it. Both medians are{" "}
            <span className="font-mono tabular-nums">{travel.medianRating}</span>. No finding here
            about flying making a film worse, only about how many fit in a day.
          </>
        ) : (
          <>
            The flight mean is{" "}
            <span className="font-mono tabular-nums">{ratingLabel(travel.meanRating)}</span>{" "}
            against{" "}
            <span className="font-mono tabular-nums">{ratingLabel(ordinary.meanRating)}</span>, a
            gap of <span className="font-mono">{signedLabel(stats.ratingDiff)}</span> points that
            now sits outside its interval and is worth reading.
          </>
        )}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.trips.map((trip) => (
          <div
            key={trip.label}
            className="rounded-sm px-3 py-2"
            style={{ background: hairline(tokens.ink.primary, 4) }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
                {trip.label}
              </span>
              <span
                className="font-mono text-[10px] tabular-nums whitespace-nowrap"
                style={{ color: tokens.ink.muted }}
              >
                {trip.watches} films, {trip.days.length} days
              </span>
            </div>

            {trip.days.map((day) => (
              <div key={day.date} className="mt-2 flex gap-2">
                <span className="mt-0.5 shrink-0" title={`flight ${LEG_PROSE[day.leg]}`}>
                  <svg width={16} height={16} viewBox="0 0 16 16" role="presentation">
                    <PlaneMarker x={8} y={8} r={5.5} leg={day.leg} color={tokens.ink.primary} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div
                    className="font-mono text-[10px] whitespace-nowrap"
                    style={{ color: tokens.ink.muted }}
                  >
                    {dayLabel(day.date)} · {LEG_PROSE[day.leg]}
                  </div>
                  <div className="text-[13px] leading-snug" style={{ color: tokens.ink.secondary }}>
                    {day.films.map((film, i) => (
                      <span key={`${film.tmdb_id}-${film.title}`}>
                        {i > 0 && ", "}
                        {film.title}{" "}
                        <span className="font-mono text-[11px] tabular-nums">{film.rating}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
