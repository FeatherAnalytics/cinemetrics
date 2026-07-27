"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import {
  byStarBin,
  CROSSOVER_STARS,
  likedRate,
  starLabel,
  STAR_BINS,
} from "@/lib/likedChart";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";
import { RateBars, type RateBar } from "./RateBars";

/**
 * How often the heart follows the rating.
 *
 * The spine of the whole `liked` question. Everything else in here is either a
 * consequence of this curve or a test of something that might bend it.
 *
 * Binned by half star, on the same axis RatingsByGenre labels, so the reader
 * meets one rating scale across the site rather than stars in one chart and
 * ten-point bands in another.
 */
export function LikedByRating() {
  const { filtered, filters, setSelection } = useExplorer();

  const groups = useMemo(() => byStarBin(filtered), [filtered]);

  const bars: RateBar[] = groups.map((ws, i) => {
    const r = likedRate(ws);
    return { label: starLabel(STAR_BINS[i]), liked: r.liked, n: r.n };
  });

  const activeIndex = groups.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      <RateBars
        bars={bars}
        accent={accentFor(filters.genres)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(groups[i], filters.selection, setSelection)}
      />
      <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        my rating
      </div>
    </div>
  );
}

/**
 * The blurb quotes live numbers, so it recomputes with the chart rather than
 * asserting a figure the filter has already moved.
 */
export function LikedByRatingBlurb() {
  const { filtered } = useExplorer();
  const { low, high, all } = useMemo(() => {
    const groups = byStarBin(filtered);
    // Everything under the crossover, and everything over it. The two bins in
    // between are named rather than quoted: 3.5 and 4 stars are 26% and 73%, so
    // one number for the pair would describe a level neither of them sits at.
    const below = STAR_BINS.findIndex((s) => s >= CROSSOVER_STARS[0]);
    const above = STAR_BINS.findIndex((s) => s > CROSSOVER_STARS[1]);
    return {
      low: likedRate(groups.slice(0, below).flat()),
      high: likedRate(groups.slice(above).flat()),
      all: likedRate(filtered),
    };
  }, [filtered]);

  if (all.n === 0) return null;

  // Each end is quoted only if it HAS watches. Filtered to the Miyazaki
  // collection nothing is rated under 3.5 stars, and the sentence read "almost
  // never given (0% of 0)", which is a rate computed from an empty set stated
  // as a fact about my taste.
  const ends = [
    low.n > 0 &&
      `below ${starLabel(CROSSOVER_STARS[0])} it is almost never given (${Math.round(
        low.rate * 100,
      )}% of ${low.n})`,
    high.n > 0 &&
      `past ${starLabel(CROSSOVER_STARS[1])} it is close to automatic (${Math.round(
        high.rate * 100,
      )}% of ${high.n})`,
  ].filter(Boolean) as string[];

  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      {ends.length > 0 && (
        <>
          The heart tracks the rating almost everywhere: {ends.join(", and ")}.{" "}
        </>
      )}
      The flip happens between {starLabel(CROSSOVER_STARS[0])} and{" "}
      {starLabel(CROSSOVER_STARS[1])}, and those two bins are the only place the measures
      can disagree.
    </p>
  );
}
