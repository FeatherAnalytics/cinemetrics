"use client";

import { PlaneMarker, type TravelLeg } from "@/lib/travel";
import { hairline, useTheme } from "@/lib/theme";
import { ratingLabel, ratioLabel, type TravelStats } from "@/lib/travelStats";

/**
 * PROTOTYPE 1. One narrow column per travel date, films stacked, dart on top.
 *
 * The reading it aims for is "here are the flights and what I watched on each",
 * so the unit is the DAY and the films are its contents. Columns cluster by trip,
 * because four journeys is the structure a reader recognizes and ten bare dates
 * is not.
 *
 * HTML cells rather than SVG rects. The cell height is a breakpoint-dependent
 * value (`--lab-cell-h` in globals.css) and SVG geometry attributes take numbers,
 * not `var()`, so an SVG version would need the breakpoint duplicated in JS.
 * Nothing here needs a scale, a path or a transform except the dart, which gets
 * its own 1:1 SVG box.
 *
 * The dart is `PlaneMarker` from lib/travel and stays INK, per the note there:
 * crimson is spent on genre identity and the heart, and twenty crimson marks
 * would read as twenty Horror films.
 */

/**
 * A rating as a wash of ink, against the LIBRARY's rating range and not this
 * chart's.
 *
 * 8% to 34% and no stronger. The ceiling is set by CONTRAST IN DARK MODE, which is
 * the direction that fails first: the wash mixes toward `ink.primary`, which is
 * near-black on the light card and near-white on the dark one, so a strong wash
 * lightens a dark cell until the label on top of it stops reading. At 34% the
 * label clears 4.5:1 on both surfaces; at the 48% this started on, dark fell to
 * about 3.6:1.
 *
 * That ceiling is also the honest argument against calling this a chart of
 * ratings. A 26-point span of wash cannot be resolved to ten rating points by
 * eye, which is why every cell prints its number as well.
 */
function ratingWash(rating: number | null, domain: [number, number], ink: string): string {
  if (rating == null) return "transparent";
  const [lo, hi] = domain;
  const t = hi === lo ? 0.5 : (rating - lo) / (hi - lo);
  return hairline(ink, 8 + 26 * t);
}

/** "Sep 18". The year belongs to the trip label, so a column does not repeat it. */
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCDate()}`;
}

const LEG_WORD: Record<TravelLeg, string> = {
  depart: "out",
  return: "home",
  level: "mid-trip",
};

/** The dart's own row above a column. Shared with the y axis so the two align. */
const DART_H = 18;

export function TravelSmallMultiple({ stats }: { stats: TravelStats }) {
  const { tokens } = useTheme();
  const tallest = Math.max(...stats.days.map((d) => d.films.length));

  // A cell's height comes from the custom property, so anything that has to match
  // one is expressed the same way rather than as a pixel count.
  const cellHeight = "var(--lab-cell-h)";

  /**
   * The two captions under a column, and the same two again under the y axis
   * holding nothing.
   *
   * The axis has to be exactly as tall as the tallest trip block for `items-end`
   * to put its ticks on their cells, and a caption's height is font metrics plus
   * padding rather than a number this file can know. Rendering the real markup
   * invisibly is what makes the heights equal by construction. Guessing at spacer
   * heights instead left every tick sitting 6px above its own row.
   */
  const dayCaption = (label: string | null) => (
    <div
      className="mt-1 border-t pt-1 text-center font-mono text-[10px] whitespace-nowrap"
      style={{
        borderColor: label == null ? "transparent" : tokens.ink.axis,
        color: tokens.ink.muted,
        visibility: label == null ? "hidden" : undefined,
      }}
    >
      {label ?? "x"}
    </div>
  );

  const tripCaption = (label: string | null) => (
    <div
      className="mt-1 text-center text-[11px] whitespace-nowrap"
      style={{
        color: tokens.ink.secondary,
        visibility: label == null ? "hidden" : undefined,
      }}
    >
      {label ?? "x"}
    </div>
  );

  return (
    <div>
      <div className="flex items-end gap-4 overflow-x-auto pb-1">
        {/* Y axis: film count, ticks aligned to the cell rows they label. There is
            no zero tick, because a column of zero films is not in the data at all.
            See the note on 2019-10-20 in lib/travel. */}
        <div className="flex shrink-0 flex-col" aria-hidden>
          <div className="flex flex-col">
            <div style={{ height: DART_H }} />
            {Array.from({ length: tallest }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-end pr-1 font-mono text-[10px] tabular-nums"
                style={{ height: cellHeight, color: tokens.ink.muted }}
              >
                {tallest - i}
              </div>
            ))}
            {dayCaption(null)}
          </div>
          {tripCaption(null)}
        </div>

        {stats.trips.map((trip) => (
          <div key={trip.label} className="flex shrink-0 flex-col">
            <div className="flex items-end gap-1">
              {trip.days.map((day) => (
                <div key={day.date} className="flex w-16 shrink-0 flex-col justify-end">
                  {/* Dart above the column, not on a cell: the flight is a property
                      of the whole DAY, which is why TRAVEL_DAYS keys on the date
                      alone. */}
                  <div
                    className="mx-auto"
                    style={{ height: DART_H }}
                    title={`${dayLabel(day.date)}: flight ${LEG_WORD[day.leg]}`}
                  >
                    <svg width={DART_H} height={DART_H} viewBox="0 0 18 18" role="presentation">
                      <PlaneMarker x={9} y={9} r={6} leg={day.leg} color={tokens.ink.primary} />
                    </svg>
                  </div>

                  {day.films.map((film) => (
                    <div
                      key={`${film.tmdb_id}-${film.title}`}
                      className="flex items-center justify-center font-mono text-[10px] tabular-nums"
                      style={{
                        height: cellHeight,
                        background: ratingWash(film.rating, stats.ratingDomain, tokens.ink.primary),
                        borderTop: `1px solid ${tokens.ink.surface}`,
                        // Primary and not secondary: the label sits on a wash whose
                        // lightness moves with the rating, so it needs the highest
                        // contrast the theme has rather than a muted tone.
                        color: tokens.ink.primary,
                      }}
                      title={`${film.title}${film.year ? ` (${film.year})` : ""} · ${film.rating ?? "unrated"}`}
                    >
                      {film.rating}
                    </div>
                  ))}

                  {dayCaption(dayLabel(day.date))}
                </div>
              ))}
            </div>
            {tripCaption(trip.label)}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
        {/* The dart angle carries the leg, so it needs saying once. Three marks,
            because a fourth direction does not exist. */}
        <span className="flex items-center gap-2">
          <span style={{ color: tokens.ink.muted }}>flight</span>
          {(["depart", "level", "return"] as TravelLeg[]).map((leg) => (
            <span key={leg} className="flex items-center gap-1">
              <svg width={16} height={16} viewBox="0 0 16 16" role="presentation">
                <PlaneMarker x={8} y={8} r={5.5} leg={leg} color={tokens.ink.primary} />
              </svg>
              <span style={{ color: tokens.ink.muted }}>{LEG_WORD[leg]}</span>
            </span>
          ))}
        </span>

        {/* Legend for the wash. Prints its own endpoints, so there is no reading in
            which the ramp silently means the travel range. */}
        <span className="flex items-center gap-2">
          <span style={{ color: tokens.ink.muted }}>rating</span>
          {[stats.ratingDomain[0], 50, 70, 90, stats.ratingDomain[1]].map((r) => (
            <span key={r} className="flex items-center gap-1">
              <span
                className="inline-block h-3 w-6"
                style={{
                  background: ratingWash(r, stats.ratingDomain, tokens.ink.primary),
                  border: `1px solid ${tokens.ink.grid}`,
                }}
              />
              <span className="font-mono tabular-nums" style={{ color: tokens.ink.muted }}>
                {r}
              </span>
            </span>
          ))}
        </span>
      </div>

      <p className="mt-4 text-sm" style={{ color: tokens.ink.secondary }}>
        {stats.travel.watches} films across {stats.travel.days} flight days in{" "}
        {stats.trips.length} trips, {stats.travel.filmsPerDay.toFixed(2)} per day against{" "}
        {stats.ordinary.filmsPerDay.toFixed(2)} on the {stats.ordinary.days} ordinary viewing days,
        which is {ratioLabel(stats.filmsPerDayRatio)}. The wash is the rating and it{" "}
        {stats.ratingGapIsNoise
          ? `does not move: the travel mean sits ${ratingLabel(
              Math.abs(stats.ratingDiff),
            )} points from the ordinary one on ${stats.travel.ratingN} watches, inside its own standard error of ${ratingLabel(
              stats.ratingDiffSe,
            )}, and both medians are ${stats.travel.medianRating}.`
          : `differs by ${ratingLabel(
              Math.abs(stats.ratingDiff),
            )} points, outside the interval, so the gap is worth reading.`}
      </p>
    </div>
  );
}
