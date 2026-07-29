"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { starLabel } from "@/lib/likedChart";
import { medianTmdbStars, tmdbStarBins } from "@/lib/watchlistChart";
import { CategoryBars } from "../stats/CategoryBars";
import { ChartTakeaway } from "../ChartTakeaway";

/**
 * What everyone else thinks of the films still waiting.
 *
 * On the same half-star axis as "How I rate", and drawn by the same component,
 * so the two shapes can be read against each other rather than merely sitting on
 * the same page. That comparison is the reason the chart exists: the watchlist
 * has no ratings of mine, so the nearest available answer to "is this a good
 * list" is the crowd's, in the units my own scale already uses.
 *
 * The score is TMDB's, not IMDb's. Every rating column the seed inherits from
 * OMDb covers 34 of the 136 films; TMDB's covers 130. Drawing the OMDb column
 * would have shown a quarter of the list at full confidence.
 *
 * No cross-filter. Every other watchlist chart clicks through to a rail control,
 * and there is no filter for someone else's score — inventing one would put a
 * fourth rating scale in a rail that already carries mine.
 */
export function WatchlistScores() {
  const { filteredWatchlist } = useExplorer();
  const { tokens } = useTheme();
  const [hover, setHover] = useState<number | null>(null);

  const bins = useMemo(() => tmdbStarBins(filteredWatchlist), [filteredWatchlist]);
  const median = useMemo(() => medianTmdbStars(filteredWatchlist), [filteredWatchlist]);

  const scored = bins.reduce((s, b) => s + b.count, 0);
  const unscored = filteredWatchlist.length - scored;

  if (scored === 0) {
    return (
      <p className="text-sm" style={{ color: tokens.ink.muted }}>
        Nothing in view carries a TMDB score.
      </p>
    );
  }

  const bars = bins.map((b) => ({ label: starLabel(b.stars), value: b.count }));
  const shown = hover != null ? bins[hover] : null;

  return (
    <figure className="m-0">
      {/* Readout above the chart, the way the cumulative chart does it, so the
          columns keep their baseline aligned with the axis below. */}
      <p className="mb-1 h-4 text-xs" style={{ color: tokens.ink.muted }}>
        {shown
          ? shown.count === 0
            ? `${starLabel(shown.stars)}: nothing on the list`
            : `${starLabel(shown.stars)}: ${Math.round(
                (100 * shown.count) / scored,
              )}% of the watchlist`
          : ""}
      </p>
      <CategoryBars bars={bars} onHover={setHover} barLabel="value" showMedian={false} />
      <ChartTakeaway>
        {median != null && `median ${median.toFixed(1)}★ · `}
        TMDB audience score
        {unscored > 0 && ` · ${unscored} unscored`}
      </ChartTakeaway>
    </figure>
  );
}
