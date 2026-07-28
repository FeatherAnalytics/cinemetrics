"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { genreBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";
import { RankedBars } from "./RankedBars";

/**
 * What the watchlist is made of, by genre.
 *
 * Every genre a film carries counts, so the bars sum well past the film count.
 * The alternative — one genre per film — would have to pick from TMDB's array,
 * whose order ranks nothing, and the site's own `primaryGenre` is worse here
 * still: it recognises five genres, so it would file Documentary, Crime,
 * Mystery and Science Fiction together under "Other" and lose most of the list.
 *
 * The five tracked genres keep their identity colours. Everything else shares
 * the neutral, because inventing eleven more colours would imply eleven more
 * meanings the rest of the site does not carry.
 */
export function WatchlistGenres() {
  const { filteredWatchlist } = useExplorer();
  const bars = useMemo(() => genreBars(filteredWatchlist), [filteredWatchlist]);

  return (
    <>
      <RankedBars
        bars={bars}
        total={filteredWatchlist.length}
        ariaLabel="Watchlist films per genre"
      />
      <ChartTakeaway>
        films carry several genres each
      </ChartTakeaway>
    </>
  );
}
