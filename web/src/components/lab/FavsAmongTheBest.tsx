"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { GENRE_COLORS, INK, primaryGenre } from "@/lib/palette";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { ceilingFilms } from "@/lib/fourFavs";
import { favColor, StarMarker } from "@/lib/favMarker";
import { isPicked, pickWatches } from "@/components/stats/pick";

const LABEL_W = 210;
const COUNT_W = 300;
// Room for a value label that will not fit inside a short bar.
const VALUE_W = 34;
// The star sits at the RIGHT end of the label gutter, so it touches the bar it
// belongs to. A right-edge column lined the stars up but put them past the value
// labels, a whole chart away from the row they mark; beside the title they read as
// part of the name. Between the two is the only place that says "this bar".
const STAR_SLOT = 18;
const WIDTH = LABEL_W + COUNT_W + VALUE_W;
const STAR_X = LABEL_W - STAR_SLOT / 2 - 2;
const TITLE_X = LABEL_W - STAR_SLOT - 6;
const INSIDE_MIN = 40;
const MAX_TITLE = 26;

/**
 * How many rows the chart will draw before disclosing a tail.
 *
 * The tie is nineteen films unfiltered, which fits. A narrow filter can put the
 * ceiling somewhere crowded, though: filtered to one genre the top rating in view
 * might be 70, held by forty films, and forty rows is a list rather than a chart.
 */
const TOP_N = 20;

function clipTitle(t: string): string {
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t;
}

/**
 * The four favorites among everything I rated just as highly.
 *
 * THE CHART IS A REFUTATION, and that is why it is built as a tie rather than as
 * a ranking. Nineteen films are rated 100 and four of them are on the profile, so
 * the rating cannot pick the favorites out: whatever does the picking is not in
 * this column.
 *
 * Ordering by watch count tests the obvious next theory in the same picture,
 * because returning to a film is the closest thing the data has to devotion. It
 * fails too, and visibly: Midsommar is seven watches at 100 and is not a
 * favorite, while Paprika is two and is. A reader can see both facts without
 * being told either.
 *
 * Favorites carry a STAR as well as a color, because identity is never carried by
 * color alone here: crimson against chrome gray is exactly the pair a red-green
 * reader has the most trouble with. Both the star and the bar take the film's
 * primary genre color rather than the house crimson, so a favorite reads the same
 * here as it does on every other chart that colors by genre.
 */
export function FavsAmongTheBest() {
  const { filtered, filters, setSelection } = useExplorer();
  const [hover, setHover] = useState<number | null>(null);

  const { rating, films } = useMemo(() => ceilingFilms(filtered), [filtered]);

  // Favorites are pinned in rather than trimmed by the cap. They are the subject:
  // a cap that dropped one would leave the chart quietly making a weaker claim
  // than the caption beside it.
  const { rows, tail } = useMemo(() => {
    if (films.length <= TOP_N) return { rows: films, tail: 0 };
    const favs = films.filter((f) => f.fav);
    const rest = films.filter((f) => !f.fav).slice(0, Math.max(TOP_N - favs.length, 0));
    const keep = new Set([...favs, ...rest].map((f) => f.tmdb_id));
    return {
      rows: films.filter((f) => keep.has(f.tmdb_id)),
      tail: films.length - keep.size,
    };
  }, [films]);

  if (rating == null || rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        Nothing in view is rated.
      </p>
    );
  }

  const maxN = Math.max(...rows.map((f) => f.watches.length));
  const HEIGHT = 20 + (rows.length + (tail > 0 ? 1 : 0)) * (BAR_H + GAP);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Every film rated ${rating}, ordered by how many times I watched it. Bars grow rightward from the title; the four profile favorites are starred and drawn in their genre color.`}
      >
        <text
          x={LABEL_W}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          WATCHES
        </text>
        <text
          x={0}
          y={8}
          fill={INK.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          RATED {rating}
        </text>

        {rows.map((f, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const on = isPicked(f.watches, filters.selection);
          const dim = filters.selection != null && !on;
          const isHover = hover === i;
          const barLen = (f.watches.length / maxN) * COUNT_W;
          const inside = barLen > INSIDE_MIN;
          return (
            <g
              key={f.tmdb_id}
              style={{ cursor: "pointer" }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pickWatches(f.watches, filters.selection, setSelection)}
            >
              <rect x={0} y={y} width={WIDTH} height={BAR_H} fill="transparent" />

              {f.fav && (
                <StarMarker
                  x={STAR_X}
                  y={y + BAR_H / 2}
                  r={6}
                  fill={favColor(f.watches[0].film)}
                />
              )}

              <text
                x={TITLE_X}
                y={y + BAR_H / 2}
                fill={f.fav ? INK.primary : INK.secondary}
                fontSize={12}
                fontWeight={f.fav || on ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {clipTitle(f.label)}
                {/* Only where the name was actually cut. A native tooltip on text
                    the reader can already read in full is a gray OS box for no
                    reason. */}
                {f.label.length > MAX_TITLE && <title>{f.label}</title>}
              </text>

              <rect
                x={LABEL_W}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={GENRE_COLORS[primaryGenre(f.watches[0].film)]}
                fillOpacity={isHover || on ? 0.9 : 0.72}
                stroke={on ? INK.primary : "none"}
                strokeWidth={on ? 1.75 : 0}
              />

              <text
                x={inside ? LABEL_W + barLen - 6 : LABEL_W + barLen + 6}
                y={y + BAR_H / 2}
                fill={valueLabelFill(inside)}
                fontSize={11}
                fontWeight={700}
                textAnchor={inside ? "end" : "start"}
                dominantBaseline="middle"
              >
                {f.watches.length}
              </text>

            </g>
          );
        })}

        {/* Says what the cap dropped, so the axis cannot imply the tie ends here. */}
        {tail > 0 && (
          <text
            x={TITLE_X}
            y={20 + rows.length * (BAR_H + GAP) + BAR_H / 2}
            fill={INK.muted}
            fontSize={11}
            textAnchor="end"
            dominantBaseline="middle"
          >
            + {tail} more at {rating}
          </text>
        )}
      </svg>
    </figure>
  );
}

/**
 * The blurb counts the tie live, so a filter cannot leave a sentence describing
 * films that are no longer on screen.
 */
export function FavsAmongTheBestBlurb() {
  const { filtered } = useExplorer();
  const { rating, films } = useMemo(() => ceilingFilms(filtered), [filtered]);
  if (rating == null || films.length === 0) return null;

  const favs = films.filter((f) => f.fav).length;
  const topNonFav = films.find((f) => !f.fav);
  const leastFav = films.filter((f) => f.fav).sort((a, b) => a.watches.length - b.watches.length)[0];

  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      {films.length} {films.length === 1 ? "film is" : "films are"} tied at {rating},
      my highest rating in view, and {favs} of them{" "}
      {favs === 1 ? "is a favorite" : "are favorites"}. So the rating cannot pick the
      four out.
      {topNonFav && leastFav && topNonFav.watches.length > leastFav.watches.length && (
        <>
          {" "}
          Neither can returning to them: {clipTitle(topNonFav.label)} is{" "}
          {topNonFav.watches.length} watches and is not a favorite, while{" "}
          {clipTitle(leastFav.label)} is {leastFav.watches.length} and is.
        </>
      )}
    </p>
  );
}
