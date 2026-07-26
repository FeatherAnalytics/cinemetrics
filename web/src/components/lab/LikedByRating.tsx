"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { byRatingBand, likedRate, RATING_BANDS } from "@/lib/likedChart";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";
import { RateBars, type RateBar } from "./RateBars";

/**
 * How often the heart follows the rating.
 *
 * The spine of the whole `liked` question. Everything else in here is either a
 * consequence of this curve or a test of something that might bend it.
 */
export function LikedByRating() {
  const { filtered, filters, setSelection } = useExplorer();

  const groups = useMemo(() => byRatingBand(filtered), [filtered]);

  const bars: RateBar[] = groups.map((ws, i) => {
    const r = likedRate(ws);
    return { label: RATING_BANDS[i].label, rate: r.rate, n: r.n };
  });

  const activeIndex = groups.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        hearted
      </div>
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
    const groups = byRatingBand(filtered);
    return {
      // The two ends, where the answer is effectively decided. The middle is
      // named rather than quoted: the 70s and 80s are 26% and 73%, so a single
      // number for the pair would describe a level neither of them sits at.
      low: likedRate([...groups[0], ...groups[1]]),
      high: likedRate(groups[4]),
      all: likedRate(filtered),
    };
  }, [filtered]);

  if (all.n === 0) return null;

  // Each end is quoted only if it HAS watches. Filtered to the Miyazaki
  // collection nothing is rated under 70, and the sentence read "almost never
  // given (0% of 0)", which is a rate computed from an empty set stated as a
  // fact about my taste.
  const ends = [
    low.n > 0 && `under 70 it is almost never given (${Math.round(low.rate * 100)}% of ${low.n})`,
    high.n > 0 &&
      `at 90 and above it is close to automatic (${Math.round(high.rate * 100)}% of ${high.n})`,
  ].filter(Boolean) as string[];

  return (
    <p className="text-sm" style={{ color: INK.secondary }}>
      {ends.length > 0 && (
        <>
          The heart tracks the rating almost everywhere: {ends.join(", and ")}.{" "}
        </>
      )}
      The flip happens across the 70s and 80s, and that stretch is the only place the two
      measures can disagree.
    </p>
  );
}
