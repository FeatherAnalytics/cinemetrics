"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { ratingDeltaByKey } from "@/lib/ratingDelta";
import { keywordBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";
import { RankedBars } from "./RankedBars";

const MIN_FILMS = 3;

/**
 * The tags that recur across the watchlist, and how I rate them when I get there.
 *
 * The count threshold is 3 films, not the main page's 10: that chart ranks
 * keywords by average residual, a statistic that needs a real sample before it
 * means anything, while this one just counts. A keyword on 3 of 136 films is a
 * perfectly honest count, and at 10 the whole chart would be four bars.
 *
 * The deviation track keeps its own, higher floor — it IS a statistic, so a tag
 * can have a count bar and no deviation bar. That asymmetry is the honest one:
 * plenty of tags are common on the watchlist and rare in what has been watched.
 *
 * Read the counts as a description of the LIST, not of taste. TMDB keywords are
 * contributed unevenly, so a well-tagged film pushes more bars than a thin one.
 */
export function WatchlistKeywords() {
  const { filteredWatchlist, filtered } = useExplorer();
  const bars = useMemo(
    () => keywordBars(filteredWatchlist, 12, MIN_FILMS),
    [filteredWatchlist],
  );

  // From the watch log: the watchlist's own films have no rating to average.
  const deltas = useMemo(
    () => ratingDeltaByKey(filtered, (w) => w.film?.keywords ?? []),
    [filtered],
  );

  if (bars.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.15)" }}
      >
        No keyword is shared by {MIN_FILMS}+ films in this view. Widen the filters.
      </div>
    );
  }

  return (
    <>
      <RankedBars
        bars={bars}
        total={filteredWatchlist.length}
        deltas={deltas}
        ariaLabel="Most common watchlist keywords, with how I rate films I have already seen carrying each"
      />
      <ChartTakeaway>
        keywords on {MIN_FILMS}+ watchlist films · deviation from films I&rsquo;ve seen
      </ChartTakeaway>
    </>
  );
}
