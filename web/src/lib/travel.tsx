import { INK } from "./palette";

/**
 * Which leg of a trip a flight was: out, home, or neither.
 *
 * "level" is a flight taken in the middle of a trip, so it is going neither away
 * from home nor back to it. One day in the data is like this and it needs its own
 * value, because forcing it into depart or return would state something false
 * about the trip.
 */
export type TravelLeg = "depart" | "return" | "level";

/**
 * The days I spent on a plane, keyed by DATE alone.
 *
 * Not by `{tmdb_id, date}` the way `SOLSTICE_WATCH` is keyed. The solstice marks
 * one particular watch; a flight is a property of the whole day, so every watch
 * on the date takes the marker and a day of four films shows four planes.
 *
 * Two things the reader of this list should know:
 *
 * - 2019-09-18 is the busiest viewing day in the data at four films, and all four
 *   were watched on a plane. It ties with 2020-01-04, also four; `computeBinges`
 *   breaks the tie toward whichever the watch log lists first, which today is the
 *   flight. So this is "the peak" rather than "the only day that large".
 * - 2019-10-20 is deliberately NOT here. It was named as part of an overnight
 *   return, but the watch log records no films on it, so it has nothing to mark.
 *   Its absence is the correct state, not a gap to fill.
 *
 * ASSUMPTION, correctable by the owner: the 2019 legs were given explicitly. The
 * 2021 and 2023 flights were given only as pairs, with no direction. Each pair is
 * exactly seven days apart, so the first of each is recorded as the outbound leg
 * and the second as the return. If either trip actually ran the other way, fix it
 * here.
 */
export const TRAVEL_DAYS: Record<string, TravelLeg> = {
  "2019-09-18": "depart",
  "2019-09-23": "return",
  "2019-09-24": "return",
  "2019-10-13": "depart",
  // Mid-trip: a flight between two stops, neither out nor home.
  "2019-10-18": "level",
  "2019-10-21": "return",
  "2021-12-03": "depart",
  "2021-12-10": "return",
  "2023-10-03": "depart",
  "2023-10-10": "return",
};

/**
 * The leg a watch was flown on, or null for the great majority watched on the
 * ground.
 *
 * Takes anything carrying a date rather than an `EnrichedWatch`, because the date
 * is the only field consulted. That lets a story pass one of the day's watches and
 * a test pass a raw row out of the exported JSON, without a second lookup helper
 * that could disagree with this one.
 */
export function travelLeg(w: { date: string }): TravelLeg | null {
  return TRAVEL_DAYS[w.date] ?? null;
}

/** Nose up for the outbound leg, down for the way home, flat for mid-trip. */
const LEG_ANGLE: Record<TravelLeg, number> = {
  depart: -35,
  level: 0,
  return: 35,
};

/**
 * A dart, nose pointing along +x, sized by `r` (nose to center).
 *
 * Deliberately not a plane. An accurate silhouette needs a fuselage, swept wings
 * and a tailplane resolved separately, and at the size these charts draw marks —
 * the solstice sun's core is r 3.2 in the swim lane — those three parts merge into
 * one blob. A four-point dart keeps the two things the mark has to say, that it is
 * a flight and which way it was going, at any size a dot is legible at.
 */
export function planePath(cx: number, cy: number, r: number): string {
  const pts: [number, number][] = [
    [r, 0],
    [-0.78 * r, -0.66 * r],
    [-0.34 * r, 0],
    [-0.78 * r, 0.66 * r],
  ];
  return (
    "M" +
    pts.map(([dx, dy]) => `${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)}`).join("L") +
    "Z"
  );
}

/**
 * The mark for a watch flown rather than sat through: an ink dart, angled by leg.
 *
 * Ink and not the accent. Crimson is spent on genre identity and the heart, and
 * twenty crimson marks scattered through the lanes would read as twenty Horror
 * films. A silhouette is what a plane looks like anyway.
 *
 * Follows `SunMarker`'s conventions: pointer handlers belong on the parent group,
 * and `color` defaults to the light constant so pure callers see stable output
 * while a chart passes the active theme's token.
 */
export function PlaneMarker({
  x,
  y,
  r = 5,
  leg,
  color = INK.primary,
}: {
  x: number;
  y: number;
  r?: number;
  leg: TravelLeg;
  color?: string;
}) {
  return (
    <path
      d={planePath(x, y, r)}
      fill={color}
      transform={`rotate(${LEG_ANGLE[leg]} ${x} ${y})`}
    />
  );
}
