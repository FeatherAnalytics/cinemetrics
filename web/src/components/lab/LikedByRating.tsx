"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import {
  byStarBin,
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
 * Says what the columns are and stops.
 *
 * It used to quote both end rates and name the crossover, which the annotation
 * above it already states and the bars already print. Three copies of one finding.
 */
export function LikedByRatingBlurb() {
  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      The share of each rating that got a heart.
    </p>
  );
}
