"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { primaryGenre, type GenreKey } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { BAR_H, GAP, valueLabelFill } from "@/lib/barChart";
import { mean } from "@/lib/statsChart";
import type { EnrichedWatch } from "@/lib/types";
import { accentFor, isPicked, pickWatches } from "./pick";

// Geometry copied from "What travels well" so the two charts are the same
// object seen twice, not two charts that resemble each other. BAR_H and GAP come
// from the shared module; the track widths match CountryBars exactly.
const LABEL_W = 176;
const COUNT_W = 286; // viewings track, grows left to right
const RATING_W = 226; // rating track, grows right to left
const WIDTH = LABEL_W + COUNT_W + RATING_W;
// The rating bars are anchored at the right and grow back toward the viewings
// bars, so the two series meet in the middle instead of diverging from a spine.
const RATING_ORIGIN = WIDTH;
const TOP_N = 12;
// Below this length a value label will not fit inside its bar and sits outside.
const INSIDE_MIN = 44;

// The label gutter is fixed, so a long title has to be cut rather than run off
// the left edge of the SVG, where it simply disappears.
const MAX_TITLE = 24;

function clipTitle(t: string): string {
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t;
}

type Film = {
  tmdb_id: number;
  title: string;
  genre: GenreKey;
  watches: EnrichedWatch[];
  rating: number | null;
};

export type RewatchSummary = {
  rows: Film[];
  repeatFilms: number;
  allFilms: number;
  viewings: number;
  returns: number;
  tailFilms: number;
  tailViewings: number;
  tailMin: number;
  tailMax: number;
};

/**
 * Shared by the chart and its blurb, so the sentence and the picture cannot
 * disagree about the numbers.
 */
export function useMostRewatched(limit = TOP_N): RewatchSummary {
  const { filtered } = useExplorer();
  return useMemo(() => {
    const byFilm = new Map<number, { f: Film; ratings: number[] }>();
    for (const w of filtered) {
      const e =
        byFilm.get(w.tmdb_id) ??
        ({
          f: {
            tmdb_id: w.tmdb_id,
            title: w.film?.title ?? String(w.tmdb_id),
            genre: primaryGenre(w.film),
            watches: [],
            rating: null,
          },
          ratings: [],
        } as { f: Film; ratings: number[] });
      e.f.watches.push(w);
      if (w.rating != null) e.ratings.push(w.rating);
      byFilm.set(w.tmdb_id, e);
    }
    for (const e of byFilm.values()) {
      e.f.rating = e.ratings.length ? mean(e.ratings) : null;
    }

    // Viewings first, then rating as the tiebreak, so a block of films watched
    // the same number of times is itself ordered by how much they were liked:
    // the two bars then descend together and any row where they disagree stands
    // out. Title only breaks a genuine tie on both. Unrated films sink rather
    // than float, since a missing rating is not a low one.
    const repeat = [...byFilm.values()]
      .map((e) => e.f)
      .filter((f) => f.watches.length > 1)
      .sort(
        (a, b) =>
          b.watches.length - a.watches.length ||
          (b.rating ?? -1) - (a.rating ?? -1) ||
          a.title.localeCompare(b.title),
      );

    const viewings = repeat.reduce((s, f) => s + f.watches.length, 0);
    const shown = repeat.slice(0, limit);
    const tail = repeat.slice(limit);
    return {
      rows: shown,
      repeatFilms: repeat.length,
      allFilms: byFilm.size,
      viewings,
      // A film seen three times is two returns, not three.
      returns: viewings - repeat.length,
      // Everything below the cut. The list stops at twelve, and the twelfth
      // film has three viewings, so without this the chart silently implies
      // nothing was watched exactly twice when in fact most repeats were.
      tailFilms: tail.length,
      tailViewings: tail.reduce((s, f) => s + f.watches.length, 0),
      tailMin: tail.length ? Math.min(...tail.map((f) => f.watches.length)) : 0,
      tailMax: tail.length ? Math.max(...tail.map((f) => f.watches.length)) : 0,
    };
  }, [filtered, limit]);
}

/**
 * What gets returned to, and whether returning tracks liking it.
 *
 * Viewings grow rightward from the title, average rating leftward from the right
 * edge. The pairing is the point: a long viewings bar next to a short rating bar
 * is a film watched out of habit rather than regard, and the two are only
 * comparable at a glance because they meet in the middle.
 *
 * The absolute totals live in the blurb rather than here, so the same numbers
 * are not printed twice on one screen.
 */
export function MostRewatched() {
  const { filters, setSelection } = useExplorer();
  const { tokens } = useTheme();
  const { rows, tailFilms, tailMin, tailMax } = useMostRewatched();
  // Hover is the same contract as "What travels well": the row lifts its own
  // fill from 0.72 to 0.9, and once something is selected every other row drops
  // to 0.35. No tooltip, no growth, no color change. These two charts are the
  // same object seen twice, so they have to answer the cursor the same way.
  const [hover, setHover] = useState<number | null>(null);
  const accent = accentFor(filters.genres, tokens);
  if (!rows.length) return null;

  const HEIGHT = 20 + (rows.length + (tailFilms > 0 ? 1 : 0)) * (BAR_H + GAP);
  const maxN = Math.max(...rows.map((r) => r.watches.length));
  // Rating bars scale against the full 0-100 range rather than the local max, so
  // a 70 and an 80 do not read as a short bar and a huge one.
  const ratingLen = (r: number) => (r / 100) * RATING_W;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Films ranked by how many times they were watched, colored by genre. Viewings bars grow rightward from the title; mirrored bars grow leftward from the right edge showing my average rating for that film."
      >
        {/* Column headers */}
        <text
          x={LABEL_W}
          y={8}
          fill={tokens.ink.muted}
          fontSize={9}
          letterSpacing="0.1em"
          fontFamily="var(--font-mono)"
        >
          VIEWINGS
        </text>
        <text
          x={RATING_ORIGIN}
          y={8}
          fill={tokens.ink.muted}
          fontSize={9}
          letterSpacing="0.1em"
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          MY RATING
        </text>

        {rows.map((f, i) => {
          const y = 20 + i * (BAR_H + GAP);
          const on = isPicked(f.watches, filters.selection);
          const anySelected = filters.selection != null;
          const dim = anySelected && !on;
          const isHover = hover === i;
          const barLen = (f.watches.length / maxN) * COUNT_W;
          const countInside = barLen > INSIDE_MIN;
          const rLen = f.rating != null ? ratingLen(f.rating) : 0;
          const ratingInside = rLen > INSIDE_MIN;
          return (
            <g
              key={f.tmdb_id}
              style={{ cursor: "pointer" }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pickWatches(f.watches, filters.selection, setSelection)}
            >
              {/* Row hit area, so the whole line is clickable */}
              <rect x={0} y={y} width={WIDTH} height={BAR_H} fill="transparent" />

              <text
                x={LABEL_W - 8}
                y={y + BAR_H / 2}
                fill={on ? tokens.ink.primary : tokens.ink.secondary}
                fontSize={12}
                fontWeight={on ? 700 : 400}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {clipTitle(f.title)}
                {/* Only when the name was actually cut. A `<title>` on text the
                    reader can already read in full is a native tooltip for no
                    reason; on a truncated string it is the standard way to
                    recover what was dropped. */}
                {f.title.length > MAX_TITLE && <title>{f.title}</title>}
              </text>

              <rect
                x={LABEL_W}
                y={y}
                width={barLen}
                height={BAR_H}
                fill={tokens.genre[f.genre]}
                fillOpacity={isHover || on ? 0.9 : 0.72}
                stroke={on ? accent : "none"}
                strokeWidth={on ? 1.75 : 0}
              />

              {/* Viewing count at the end of the bar */}
              <text
                x={countInside ? LABEL_W + barLen - 6 : LABEL_W + barLen + 6}
                y={y + BAR_H / 2}
                fill={valueLabelFill(countInside, tokens.ink)}
                fontSize={11}
                fontWeight={700}
                textAnchor={countInside ? "end" : "start"}
                dominantBaseline="middle"
              >
                {f.watches.length}
              </text>

              {/* Average rating. Mirrors the viewings bar: same fill, opposite
                  direction, anchored at the right so the pair converges. */}
              {f.rating != null && (
                <>
                  <rect
                    x={RATING_ORIGIN - rLen}
                    y={y}
                    width={rLen}
                    height={BAR_H}
                    fill={tokens.genre[f.genre]}
                    fillOpacity={isHover || on ? 0.9 : 0.72}
                    stroke={on ? accent : "none"}
                    strokeWidth={on ? 1.75 : 0}
                  />
                  {/* Mirrors the count label: at the growing end of its own bar,
                      inside when there is room, same weight and fill rule. */}
                  <text
                    x={RATING_ORIGIN - rLen + (ratingInside ? 6 : -6)}
                    y={y + BAR_H / 2}
                    fill={valueLabelFill(ratingInside, tokens.ink)}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor={ratingInside ? "start" : "end"}
                    dominantBaseline="middle"
                  >
                    {Math.round(f.rating)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* The cut, stated. The list stops at twelve and the twelfth film has
            three viewings, so without this row the chart reads as though
            nothing was watched exactly twice, when in fact that is most of
            them. Same shape as the "+ N more countries" row in CountryBars. */}
        {tailFilms > 0 && (
          <text
            // Left-aligned into the bar track, not right-aligned into the label
            // gutter the way CountryBars does it. That gutter is 176px and this
            // sentence is far longer than "+ 12 more countries", so anchored at
            // the end it ran off the left edge of the viewBox and lost its first
            // words. The track next to it is empty on this row.
            x={LABEL_W}
            y={20 + rows.length * (BAR_H + GAP) + BAR_H / 2}
            fill={tokens.ink.muted}
            fontSize={11}
            textAnchor="start"
            dominantBaseline="middle"
          >
            + {tailFilms} more film{tailFilms === 1 ? "" : "s"} at{" "}
            {tailMin === tailMax ? tailMin : `${tailMin}–${tailMax}`} viewings
          </text>
        )}
      </svg>
    </figure>
  );
}

/** The numbers, stated once, next to the chart's heading. */
export function MostRewatchedBlurb() {
  const { repeatFilms, allFilms, returns } = useMostRewatched();
  if (!allFilms) return null;
  // A filter can leave nothing that was ever watched twice, and the general
  // sentence then degenerated into "0% of films (0 of 25) account for all 0
  // returns", which is three zeros dressed up as a finding.
  if (repeatFilms === 0) {
    return <>Nothing under this filter has been watched more than once.</>;
  }
  const pct = Math.round((100 * repeatFilms) / allFilms);
  return (
    <>
      Rewatching is concentrated: <b>{pct}%</b> of films ({repeatFilms} of {allFilms}) account for
      all {returns} returns.
    </>
  );
}
