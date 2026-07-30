"use client";

import { useMemo } from "react";
// `planePath` is imported for MEASUREMENT only. The dart variant carries
// `path: null` so it renders through the real `PlaneMarker`, which means the
// shipping mark in this comparison is the shipping component and not a second
// call to its geometry; `inkVsDot` is the one place that needs the outline itself.
import { PlaneMarker, planePath, travelLeg, type TravelLeg } from "@/lib/travel";
import { primaryGenre, type GenreKey } from "@/lib/palette";
import { useTheme, type Tokens } from "@/lib/theme";
import type { Dataset } from "@/lib/types";

/**
 * SECTION 4. Three candidate marks for a flown watch, at the sizes and angles the
 * swim lane would actually draw them.
 *
 * The question is whether a plane silhouette can replace the dart. `planePath`'s
 * own doc comment argues it cannot, on the grounds that a fuselage, swept wings
 * and a tailplane merge into one blob "at the size these charts draw marks", and
 * cites the solstice sun's core at r 3.2. But `PlaneMarker` defaults to r 5, not
 * 3.2, so the argument was calibrated against a smaller mark than the one that
 * ships. That is worth re-examining rather than taking on trust, which is what
 * this section is for.
 *
 * NOTHING HERE IS WIRED TO PRODUCTION. `travel.tsx` and `SwimLaneChart.tsx` are
 * untouched; the dart stays the shipping mark until the owner picks. The dart
 * shown here is the real `planePath` rather than a copy, so the candidate cannot
 * be compared against a stale duplicate of the thing it would replace.
 */

/**
 * The leg angles, mirroring the private `LEG_ANGLE` in lib/travel.
 *
 * Duplicated rather than exported, because exporting it would mean editing
 * `travel.tsx`, which this section is explicitly not allowed to do. The
 * duplication is pinned: `markerLab.test.tsx` asserts these produce the same
 * transform string `PlaneMarker` produces for every leg, so the two cannot drift
 * without a test going red.
 */
export const LEG_ANGLE: Record<TravelLeg, number> = {
  depart: -35,
  level: 0,
  return: 35,
};

export const LEGS: TravelLeg[] = ["depart", "level", "return"];

/** The sizes under review. `PlaneMarker` ships at 5. */
export const SIZES = [5, 6, 7];

/** What an ordinary watch draws in the swim lane, for scale. */
const DOT_R = 3.5;

function pathFrom(pts: [number, number][], cx: number, cy: number): string {
  return (
    "M" +
    pts.map(([dx, dy]) => `${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)}`).join("L") +
    "Z"
  );
}

/** Shoelace area of a closed `M x,y L x,y ... Z` outline. */
export function pathArea(d: string): number {
  const pts = (d.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((p) => p.split(",").map(Number));
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * CANDIDATE A: a top-down airliner. Nose along +x, sized by `r` nose to center.
 *
 * Essentially the dart plus a tailplane and a chord on the wing, which is what
 * makes the ✈ glyph read as a plane and the dart read as an arrowhead. Twenty
 * points against the dart's four: a swept wing needs a leading edge, a tip chord
 * and a trailing edge before it stops looking like a triangle, and the tailplane
 * needs the same again at half the span.
 *
 * Symmetric about y=0, so it is the only candidate whose silhouette is unchanged
 * by the sign of the rotation.
 */
export function topDownPath(cx: number, cy: number, r: number): string {
  // Every tip is kept inside 1.01r. `r` is nose to center rather than a bounding
  // radius, and the dart's own wingtips sit at 1.022r, but the grid lays its cells
  // out on r, so a candidate reaching 1.2r would overlap the next size column and
  // make the size comparison show something other than size.
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
  const pts: [number, number][] = [
    ...half,
    // Mirror everything but the nose and the tail cone, which sit on the axis.
    ...half
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [x, -y] as [number, number]),
  ];
  return pathFrom(
    pts.map(([x, y]) => [x * r, y * r] as [number, number]),
    cx,
    cy,
  );
}

/**
 * CANDIDATE B: a side-profile airliner. Nose along +x, sized by `r`.
 *
 * Fuselage, a fin above the tail, and the wing seen edge-on below. NOT symmetric
 * about y=0, which is the interesting part: the fin goes up and the wing goes
 * down, so the mark has an inherent "this way up" that the dart and the top-down
 * view do not. Rotating it to -35 reads as a plane climbing. Rotating it to +35
 * reads as a plane descending, which is what the return leg means, so on paper
 * this is the candidate whose shape carries the most meaning.
 */
export function sideProfilePath(cx: number, cy: number, r: number): string {
  // Nose exactly on the axis, like the other two. The rotation pivots on the
  // center, so a nose sitting off-axis would point every leg slightly wrong.
  const pts: [number, number][] = [
    [1.0, 0.0], // nose tip
    [0.72, -0.13], // nose, over the top
    [0.1, -0.18], // fuselage crown
    [-0.48, -0.18], // fuselage crown, aft
    [-0.58, -0.76], // fin tip, leading
    [-0.8, -0.6], // fin tip, trailing
    [-0.85, -0.2], // fin root, trailing
    [-1.0, -0.14], // tail cone, top
    [-1.0, 0.08], // tail cone, bottom
    [-0.35, 0.18], // fuselage belly, aft
    [-0.42, 0.68], // wing tip, trailing
    [-0.05, 0.66], // wing tip, leading
    [0.3, 0.18], // wing root, leading
    [0.75, 0.15], // fuselage belly, forward
  ];
  return pathFrom(
    pts.map(([x, y]) => [x * r, y * r] as [number, number]),
    cx,
    cy,
  );
}

export type Variant = {
  id: string;
  label: string;
  /** Points in the closed outline, for the complexity column. */
  points: number;
  note: string;
  path: ((cx: number, cy: number, r: number) => string) | null;
};

export const VARIANTS: Variant[] = [
  {
    id: "dart",
    label: "Dart (shipping)",
    points: 4,
    note: "Four points. Says flight and direction, nothing else.",
    // Null means "render the real PlaneMarker", so the shipping mark in this
    // comparison is the shipping mark and not a copy of it.
    path: null,
  },
  {
    id: "top-down",
    label: "Top-down silhouette",
    points: 20,
    note: "The dart plus a tailplane and a wing chord. Symmetric, so the leg only tilts it.",
    path: topDownPath,
  },
  {
    id: "side",
    label: "Side profile",
    points: 14,
    note: "Fin up, wing down. The only candidate whose shape itself says climbing or descending.",
    path: sideProfilePath,
  },
];

/** One candidate drawn at one size and one leg. */
function Mark({
  variant,
  x,
  y,
  r,
  leg,
  color,
  opacity = 1,
}: {
  variant: Variant;
  x: number;
  y: number;
  r: number;
  leg: TravelLeg;
  color: string;
  opacity?: number;
}) {
  if (variant.path == null) {
    return (
      <g opacity={opacity}>
        <PlaneMarker x={x} y={y} r={r} leg={leg} color={color} />
      </g>
    );
  }
  return (
    <path
      d={variant.path(x, y, r)}
      fill={color}
      opacity={opacity}
      transform={`rotate(${LEG_ANGLE[leg]} ${x} ${y})`}
    />
  );
}

/**
 * Three genre hues across the three legs, so each cell shows the shape against
 * more than one color.
 *
 * Genre and not ink, because the dart now draws in the film's genre color
 * (36bb896) and a comparison in ink would be comparing something that no longer
 * ships. Crimson, blue and green are the three furthest apart in the validated
 * set, so a shape that only reads in one of them shows it here.
 */
const LEG_GENRE: Record<TravelLeg, GenreKey> = {
  depart: "Horror",
  level: "Drama",
  return: "Comedy",
};

/**
 * A candidate's fill area at size `r`, as a multiple of the ordinary dot's.
 *
 * The dart carries `path: null` so it can render through the real `PlaneMarker`,
 * which leaves this the one place that needs its geometry directly.
 */
export function inkVsDot(variant: Variant, r: number): number {
  const d = (variant.path ?? planePath)(0, 0, r);
  return pathArea(d) / (Math.PI * DOT_R ** 2);
}

/** Cell geometry, 1:1 CSS pixels so `r` means what it says. */
const CELL_W = 168;
const CELL_H = 44;
const SLOTS = [20, 58, 100, 142];

function SizeCell({ variant, r, tokens }: { variant: Variant; r: number; tokens: Tokens }) {
  const cy = CELL_H / 2;
  return (
    <svg width={CELL_W} height={CELL_H} role="img" aria-label={`${variant.label} at r ${r}`}>
      {/* The scale reference sits in every cell rather than once on the page: a
          marker judged against a dot two rows away is judged against a memory. */}
      <circle
        cx={SLOTS[0]}
        cy={cy}
        r={DOT_R}
        fill={tokens.genre.Other}
        fillOpacity={0.35 + 0.6 * 0.7}
      />
      {LEGS.map((leg, i) => (
        <Mark
          key={leg}
          variant={variant}
          x={SLOTS[i + 1]}
          y={cy}
          r={r}
          leg={leg}
          color={tokens.genre[LEG_GENRE[leg]]}
        />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------- */

// The swim lane's own geometry, copied so the context strip is the real thing at
// the real density rather than an impression of it. Not imported, because
// SwimLaneChart does not export these and this section may not edit it.
const MARGIN_LEFT = 34;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 16;
const MARGIN_RIGHT = 10;
const LANE_H = 70;
const BASE_WIDTH = 720;

type ContextPoint = {
  x: number;
  y: number;
  color: string;
  op: number;
  leg: TravelLeg | null;
};

/** Position within the calendar year, 0 to 1, as `EnrichedWatch.yearFrac` gives it. */
function yearFraction(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
}

/**
 * The three years holding flights, at the swim lane's real geometry and density.
 *
 * Only those three, because the other five contain no travel mark and would add
 * 350 dots of scrolling to a comparison about how a travel mark sits among dots.
 * The density inside each lane is untouched: 2019 carries all 131 of its watches
 * and 13 of the 21 flights.
 *
 * UNLIKE the grid above, this panel scales. The swim lane draws into a viewBox,
 * so a mark nominally at r 5 renders larger whenever the chart is wider than 720.
 * That is production behavior and is reproduced rather than corrected, because it
 * is part of what the owner is judging.
 */
function useContextPoints(data: Dataset, tokens: Tokens) {
  return useMemo(() => {
    const filmById = new Map(data.films.map((f) => [f.tmdb_id, f]));
    const years = [2019, 2021, 2023];
    const chartWidth = BASE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const points: ContextPoint[] = [];

    for (const w of data.watches) {
      const year = Number(w.date.slice(0, 4));
      const laneIndex = years.indexOf(year);
      if (laneIndex < 0) continue;
      const film = filmById.get(w.tmdb_id);
      const rating = w.rating ?? 70;
      const laneTop = MARGIN_TOP + laneIndex * LANE_H;
      points.push({
        x: MARGIN_LEFT + yearFraction(w.date) * chartWidth,
        y: laneTop + (1 - rating / 100) * LANE_H,
        color: tokens.genre[primaryGenre(film)],
        op: 0.35 + 0.6 * (rating / 100),
        leg: travelLeg(w),
      });
    }
    // Flights last so they draw over the field, as the swim lane's own sort does.
    points.sort((a, b) => Number(a.leg != null) - Number(b.leg != null));
    return { points, years, height: MARGIN_TOP + years.length * LANE_H + MARGIN_BOTTOM };
  }, [data, tokens]);
}

function ContextStrip({
  variant,
  data,
  tokens,
}: {
  variant: Variant;
  data: Dataset;
  tokens: Tokens;
}) {
  const { points, years, height } = useContextPoints(data, tokens);
  return (
    <svg
      viewBox={`0 0 ${BASE_WIDTH} ${height}`}
      width="100%"
      // Selected on by the tests. A `svg[viewBox]` selector would also catch a
      // grid cell the day one grows a viewBox, and then a test about the context
      // strips would be quietly measuring something else.
      data-strip={variant.id}
      role="img"
      aria-label={`${variant.label} among the watches of 2019, 2021 and 2023`}
    >
      {years.map((y, i) => (
        <g key={y}>
          <line
            x1={MARGIN_LEFT}
            x2={BASE_WIDTH - MARGIN_RIGHT}
            y1={MARGIN_TOP + i * LANE_H + LANE_H}
            y2={MARGIN_TOP + i * LANE_H + LANE_H}
            stroke={tokens.ink.grid}
            strokeWidth={0.5}
          />
          <text
            x={0}
            y={MARGIN_TOP + i * LANE_H + LANE_H - 4}
            fontSize={9}
            fill={tokens.ink.muted}
            fontFamily="var(--font-mono), monospace"
          >
            {y}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        p.leg ? (
          <Mark
            key={i}
            variant={variant}
            x={p.x}
            y={p.y}
            r={5}
            leg={p.leg}
            color={p.color}
            opacity={Math.max(p.op, 0.9)}
          />
        ) : (
          <circle key={i} cx={p.x} cy={p.y} r={DOT_R} fill={p.color} fillOpacity={p.op} />
        ),
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------- */

export function TravelMarkerLab({ data }: { data: Dataset }) {
  const { tokens } = useTheme();

  return (
    <div>
      <h4 className="text-sm font-bold" style={{ color: tokens.ink.primary }}>
        At true size, against the dot an ordinary watch draws
      </h4>
      <p className="mt-0.5 mb-3 text-xs" style={{ color: tokens.ink.muted }}>
        1:1 pixels, so r 5 is five pixels nose to center. Each cell holds an r {DOT_R} dot for
        scale, then the three legs at {LEG_ANGLE.depart}, {LEG_ANGLE.level} and{" "}
        {LEG_ANGLE.return} degrees, in Horror, Drama and Comedy.
      </p>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th />
              {SIZES.map((r) => (
                <th
                  key={r}
                  className="px-2 pb-1 text-left font-mono text-[10px] font-normal"
                  style={{ color: tokens.ink.muted }}
                >
                  r {r}
                  {r === 5 ? " (ships)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VARIANTS.map((variant) => (
              <tr key={variant.id} style={{ borderTop: `1px solid ${tokens.ink.grid}` }}>
                <th className="py-2 pr-3 text-left align-middle">
                  <span
                    className="block text-xs font-bold whitespace-nowrap"
                    style={{ color: tokens.ink.primary }}
                  >
                    {variant.label}
                  </span>
                  <span
                    className="block font-mono text-[10px] font-normal"
                    style={{ color: tokens.ink.muted }}
                  >
                    {variant.points} points
                  </span>
                </th>
                {SIZES.map((r) => (
                  <td key={r} className="px-2 align-middle">
                    <SizeCell variant={variant} r={r} tokens={tokens} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-1 text-xs" style={{ color: tokens.ink.secondary }}>
        {VARIANTS.map((v) => (
          <li key={v.id}>
            <span className="font-bold">{v.label}:</span> {v.note}{" "}
            <span style={{ color: tokens.ink.muted }}>
              Fills {inkVsDot(v, 5).toFixed(2)}x the ordinary dot at r 5.
            </span>
          </li>
        ))}
      </ul>

      {/* Measured, not asserted. The received wisdom about this mark is that it is
          the heaviest thing in the lane, and by FILL it is the lightest: the dart
          covers less than two thirds of a dot. What makes it shout is extent and
          the 0.9 opacity floor, not bulk, and a candidate should be judged against
          the right one of those. */}
      <p className="mt-3 text-xs" style={{ color: tokens.ink.muted }}>
        Fill area against an ordinary dot at r {DOT_R} ({(Math.PI * DOT_R ** 2).toFixed(1)}{" "}
        square pixels). Every candidate at the shipping r 5 covers LESS ink than the dot it
        replaces. The reason a flight still pulls the eye is that it is wider (about 10 pixels
        across against the dot&rsquo;s 7) and never fades below 0.9 opacity, where a dot averages{" "}
        {(0.35 + 0.6 * 0.735).toFixed(2)}.
      </p>

      <h4 className="mt-8 text-sm font-bold" style={{ color: tokens.ink.primary }}>
        In the field, at the swim lane&rsquo;s own geometry
      </h4>
      <p className="mt-0.5 mb-3 text-xs" style={{ color: tokens.ink.muted }}>
        2019, 2021 and 2023, the three years holding flights: 360 watches at r {DOT_R} with the 21
        flights at r 5, in genre color, at the real opacity ramp. This panel scales with the
        viewBox exactly as production does, so the marks render larger here than in the 1:1 grid
        above. That is the size the owner would actually get.
      </p>
      <p className="mb-3 text-xs" style={{ color: tokens.ink.muted }}>
        All 21 flights are drawn as the candidate here, on purpose. The swim lane resolves its own
        precedence between the solstice sun, the favorite star and the plane, so the live chart can
        show fewer than 21 planes; holding that constant is what lets the three shapes be compared
        on the same marks.
      </p>

      <div className="grid grid-cols-1 gap-6">
        {VARIANTS.map((variant) => (
          <div key={variant.id}>
            <div
              className="mb-1 font-mono text-[10px] tracking-wider uppercase"
              style={{ color: tokens.ink.muted }}
            >
              {variant.label}
            </div>
            <ContextStrip variant={variant} data={data} tokens={tokens} />
          </div>
        ))}
      </div>
    </div>
  );
}
