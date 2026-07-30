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
 * A top-down airliner, nose pointing along +x, sized by `r` (nose to center).
 *
 * This was a four-point dart until the candidates were drawn side by side at true
 * size behind `/lab`. The dart's justification was that a fuselage, swept wings and
 * a tailplane "merge into one blob" at chart size, citing the solstice sun's core
 * at r 3.2. That argument was measured against the wrong mark: `PlaneMarker`
 * defaults to r 5, 56% larger, and at r 5 the three parts resolve cleanly. The
 * silhouette reads as an aircraft; the dart read as an arrowhead.
 *
 * SIZE IS THE EXPENSIVE AXIS, NOT SHAPE, which is the other thing that comparison
 * settled. Fill areas at r 5, against the 38.5 square pixels of the r 3.5 dot an
 * ordinary watch draws:
 *
 *     dart           22.1 px2   0.57x a dot
 *     this shape     26.9 px2   0.70x a dot
 *     side profile   25.1 px2   0.65x a dot
 *
 * All three are LIGHTER than the dot they replace. A flight is salient because it
 * is wider (about 10 px across against the dot's 7) and never fades below 0.9
 * opacity where a dot averages 0.79, not because it carries more ink. So the 20
 * points here cost almost nothing, while raising `r` would cost real weight: at r 7
 * this shape reaches 1.37x a dot and starts to shout. Change the outline freely. Do
 * not raise the default without measuring again.
 *
 * Those pixel figures are NOMINAL. The swim lane draws into a viewBox, so at its
 * usual width a mark at r 5 lands nearer r 6.5 on screen and the dot grows with it.
 * Nothing above depends on that: every figure here is a ratio against the dot, and
 * the two scale together.
 *
 * A SIDE PROFILE WAS TRIED AND REJECTED, and not on weight, which is why its
 * 0.65x above did not save it. Fin above, wing below, 14 points. Its fin and wing
 * are each about 0.5r, which is 2.5 px at r 5, and they do not separate from the
 * fuselage; it read as a lumpy wedge. Being asymmetric it also fought the +35
 * return rotation instead of reinforcing it. This shape is mirror-symmetric about
 * its own axis, so the leg angle only ever tilts it.
 *
 * Every tip is kept inside 1.01r. `r` is nose to center and not a bounding radius
 * (the old dart's wingtips sat at 1.022r), but callers lay marks out on `r`, so a
 * wing reaching much past it would collide with its neighbors.
 */
export function planePath(cx: number, cy: number, r: number): string {
  // Half the outline, nose to tail along the upper side. The lower half is this
  // mirrored, which is what guarantees the symmetry the leg rotation depends on.
  const half: [number, number][] = [
    [1.0, 0.0], // nose
    [0.5, -0.14], // forward fuselage, full width
    [0.15, -0.15], // wing leading edge, root
    [-0.36, -0.9], // wing tip, leading
    [-0.5, -0.86], // wing tip, trailing
    [-0.25, -0.16], // wing trailing edge, root
    [-0.6, -0.16], // aft fuselage
    [-0.78, -0.46], // tailplane tip, leading
    [-0.9, -0.44], // tailplane tip, trailing
    [-0.97, -0.14], // tailplane root, trailing
    [-1.0, 0.0], // tail cone
  ];
  // The nose and the tail cone sit on the axis, so they are not mirrored.
  const pts: [number, number][] = [
    ...half,
    ...half
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [x, -y] as [number, number]),
  ];
  return (
    "M" +
    pts
      .map(([dx, dy]) => `${(cx + dx * r).toFixed(2)},${(cy + dy * r).toFixed(2)}`)
      .join("L") +
    "Z"
  );
}

/**
 * The mark for a watch flown rather than sat through: a plane, angled by leg.
 *
 * `r` DEFAULTS TO 5 AND SHOULD STAY THERE. See `planePath`: the shape is cheap and
 * the size is not. Every candidate at r 5 covers less ink than an ordinary dot,
 * and r 7 covers 1.37x one.
 *
 * The default `color` is the light ink constant, so pure callers see stable output.
 * Real charts pass the film's GENRE color rather than a token: the lane encodes
 * genre in hue and rating in height, and an ink glyph would silently drop the first
 * for every watch this mark takes over. The shape carries "flown", which leaves the
 * hue free to go on meaning what it means everywhere else.
 *
 * Follows `SunMarker`'s conventions: pointer handlers belong on the parent group.
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
