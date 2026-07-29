"use client";

import { useMemo } from "react";
import { filterWatches, useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
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
  const { filteredWatchlist, all, filters, setKeyword } = useExplorer();
  const { tokens } = useTheme();
  const bars = useMemo(
    () => keywordBars(filteredWatchlist, 12, MIN_FILMS, tokens.genre),
    [filteredWatchlist, tokens.genre],
  );

/**
 * Watches the deviation baseline is measured against.
 *
 * NOT the filtered set. Clicking a bar sets the very filter that defines the
 * group, so the group and the whole set become the same films and every
 * deviation collapses to exactly zero — the number vanished at the moment the
 * reader asked for it. Lifting this chart's own filter, and only its own, keeps
 * the rest of the rail live while leaving something to compare against. It is
 * the self-excluding cross-filter CountryBars already uses.
 */
  const base = useMemo(
    () => filterWatches(all, { ...filters, keyword: null }),
    [all, filters],
  );

  // From the watch log: the watchlist's own films have no rating to average.
  const deltas = useMemo(
    () => ratingDeltaByKey(base, (w) => w.film?.keywords ?? []),
    [base],
  );

  if (bars.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-6 text-sm"
        style={{
          color: tokens.ink.muted,
          borderColor: `color-mix(in srgb, ${tokens.ink.primary} 15%, transparent)`,
        }}
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
        active={filters.keyword}
        onPick={setKeyword}
        deltas={deltas}
        ariaLabel="Most common watchlist keywords, with how I rate films I have already seen carrying each"
      />
      <ChartTakeaway>
        keywords on {MIN_FILMS}+ watchlist films · deviation from films I&rsquo;ve seen
      </ChartTakeaway>
    </>
  );
}
