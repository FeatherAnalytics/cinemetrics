"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { mean } from "@/lib/statsChart";
import { favDirectorCohorts, type CohortFilm } from "@/lib/fourFavs";
import { favColor, StarMarker } from "@/lib/favMarker";
import { isPicked, pickWatches } from "@/components/stats/pick";

const LABEL_W = 210;
const RATING_W = 300;
const VALUE_W = 34;
// The star sits at the RIGHT end of the label gutter, so it touches the bar it
// belongs to. A right-edge column lined the stars up but put them past the value
// labels, a whole chart away from the row they mark; beside the title they read as
// part of the name. Between the two is the only place that says "this bar".
const STAR_SLOT = 18;
const WIDTH = LABEL_W + RATING_W + VALUE_W;
const STAR_X = LABEL_W - STAR_SLOT / 2 - 2;
const TITLE_X = LABEL_W - STAR_SLOT - 6;
const INSIDE_MIN = 40;
const CAPTION_H = 16;
const MAX_TITLE = 26;

function clipTitle(t: string): string {
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t;
}

/**
 * Each favorite next to the rest of its director's work that I have watched.
 *
 * The finding is that a favorite arrives with company. All four directors have
 * exactly one other film in the library, all four of those rate above my
 * baseline, and none of them reach the ceiling: 90, 80, 80, 90 against an average
 * of 73. The favorite is the peak of a pair rather than a one-off.
 *
 * And the pair stops there. Twenty-three directors in the library have three
 * films and one has eight, so going deep on a director is something I do; I have
 * simply never done it for any of these four.
 *
 * Rated on the full 0-100 scale rather than a zoomed one. Every bar here sits
 * between 80 and 100, and a scale cropped to that range would redraw an
 * eleven-point spread as the whole width of the chart, which is the reading the
 * finding depends on NOT making: the companions are close to the favorites, and
 * the point is how close.
 */
export function FavDirectors() {
  const { filtered, filters, setSelection } = useExplorer();
  const [hover, setHover] = useState<string | null>(null);

  const cohorts = useMemo(() => favDirectorCohorts(filtered), [filtered]);
  const baseline = useMemo(() => {
    const rs = filtered.map((w) => w.rating).filter((r): r is number => r != null);
    return rs.length ? mean(rs) : null;
  }, [filtered]);

  if (cohorts.length === 0) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        No favorite is in view under this filter.
      </p>
    );
  }

  // Laid out first so the SVG knows its height before anything is drawn: a
  // cohort with two companions is a taller block than one with a single
  // companion, and the count is data rather than a constant.
  type Row = { film: CohortFilm; fav: boolean; y: number };
  const rows: Row[] = [];
  const captions: { director: string; y: number }[] = [];
  let y = 20;
  for (const c of cohorts) {
    captions.push({ director: c.director, y });
    y += CAPTION_H;
    rows.push({ film: c.fav, fav: true, y });
    y += BAR_H + GAP;
    for (const o of c.others) {
      rows.push({ film: o, fav: false, y });
      y += BAR_H + GAP;
    }
    y += GAP * 2;
  }
  const HEIGHT = y;
  const len = (r: number) => (r / 100) * RATING_W;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Each of the four profile favorites grouped with the rest of that director's films I have watched. Bars are my rating on a nought to one hundred scale; the favorite is starred and drawn in its genre color, the others in gray. A dashed line marks my average rating."
      >
        <text
          x={LABEL_W}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          MY RATING
        </text>

        {/* The baseline runs behind every bar rather than per block, so the
            comparison is one line the eye can follow down the chart instead of
            four separate claims. */}
        {baseline != null && (
          <>
            <line
              x1={LABEL_W + len(baseline)}
              y1={14}
              x2={LABEL_W + len(baseline)}
              y2={HEIGHT - 4}
              stroke={INK.muted}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            <text
              x={LABEL_W + len(baseline)}
              y={HEIGHT - 6}
              fill={INK.muted}
              fontSize={8}
              textAnchor="middle"
              pointerEvents="none"
            >
              my average {Math.round(baseline)}
            </text>
          </>
        )}

        {captions.map((c) => (
          <text
            key={c.director}
            x={TITLE_X}
            y={c.y + CAPTION_H - 5}
            fill={INK.muted}
            fontSize={9}
            letterSpacing="0.08em"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {c.director.toUpperCase()}
          </text>
        ))}

        {rows.map((r) => {
          const key = `${r.film.tmdb_id}`;
          const on = isPicked(r.film.watches, filters.selection);
          const dim = filters.selection != null && !on;
          const isHover = hover === key;
          const barLen = r.film.rating != null ? len(r.film.rating) : 0;
          const inside = barLen > INSIDE_MIN;
          return (
            <g
              key={key}
              style={{ cursor: "pointer" }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pickWatches(r.film.watches, filters.selection, setSelection)}
            >
              <rect x={0} y={r.y} width={WIDTH} height={BAR_H} fill="transparent" />

              {r.fav && (
                <StarMarker
                  x={STAR_X}
                  y={r.y + BAR_H / 2}
                  r={6}
                  fill={favColor(r.film.watches[0].film)}
                />
              )}

              <text
                x={TITLE_X}
                y={r.y + BAR_H / 2}
                fill={r.fav ? INK.primary : INK.secondary}
                fontSize={12}
                fontWeight={r.fav || on ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {clipTitle(r.film.title)}
                {r.film.title.length > MAX_TITLE && <title>{r.film.title}</title>}
              </text>

              <rect
                x={LABEL_W}
                y={r.y}
                width={barLen}
                height={BAR_H}
                fill={GENRE_COLORS[primaryGenre(r.film.watches[0].film)]}
                fillOpacity={isHover || on ? 0.9 : 0.72}
                stroke={on ? INK.primary : "none"}
                strokeWidth={on ? 1.75 : 0}
              />

              {r.film.rating != null && (
                <text
                  x={inside ? LABEL_W + barLen - 6 : LABEL_W + barLen + 6}
                  y={r.y + BAR_H / 2}
                  fill={valueLabelFill(inside)}
                  fontSize={11}
                  fontWeight={700}
                  textAnchor={inside ? "end" : "start"}
                  dominantBaseline="middle"
                >
                  {r.film.rating}
                </text>
              )}

            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * One sentence. The bars carry every rating and the dashed line carries my average,
 * so the blurb's job is the count and the direction, nothing else.
 */
export function FavDirectorsBlurb() {
  const { filtered } = useExplorer();
  const cohorts = useMemo(() => favDirectorCohorts(filtered), [filtered]);
  if (cohorts.length === 0) return null;

  const companions = cohorts.flatMap((c) => c.others).length;
  if (companions === 0) return null;

  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      Each favorite arrived with {companions === cohorts.length ? "one other film" : "company"} by
      the same director.
    </p>
  );
}
