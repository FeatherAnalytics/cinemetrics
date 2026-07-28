"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { keywordBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";
import { RankedBars } from "./RankedBars";

const MIN_FILMS = 3;

/**
 * The tags that recur across the watchlist.
 *
 * The threshold is 3 films, not the main page's 10: that chart ranks keywords by
 * average residual, a statistic that needs a real sample before it means
 * anything, while this one just counts. A keyword on 3 of 136 films is a
 * perfectly honest count, and at 10 the whole chart would be four bars.
 *
 * Read as a description of the list, not of taste. TMDB keywords are contributed
 * unevenly, so a well-tagged film pushes more bars than a thinly-tagged one.
 */
export function WatchlistKeywords() {
  const { filteredWatchlist } = useExplorer();
  const bars = useMemo(
    () => keywordBars(filteredWatchlist, 12, MIN_FILMS),
    [filteredWatchlist],
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
        ariaLabel="Most common watchlist keywords"
      />
      <ChartTakeaway>keywords on {MIN_FILMS}+ watchlist films</ChartTakeaway>
    </>
  );
}
