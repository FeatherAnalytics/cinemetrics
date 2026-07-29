"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { ratingDeltaByKey } from "@/lib/ratingDelta";
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
 * The five tracked genres keep their identity colours and everything else takes
 * the neutral. Colouring an untracked row by its films' dominant primary genre
 * painted Mystery crimson, because most Mystery films here are also horror —
 * a red bar labelled Mystery above a red bar labelled Horror.
 *
 * Clicking a bar filters on the exact TMDB genre, which is why the rail carries
 * `genreTag` alongside the five-key `genres` set: that set cannot name Mystery,
 * so without it two thirds of this chart would be unclickable.
 */
export function WatchlistGenres() {
  const { filteredWatchlist, filtered, filters, setGenreTag } = useExplorer();
  const bars = useMemo(() => genreBars(filteredWatchlist), [filteredWatchlist]);

  // From the watch log: the watchlist's own films carry no rating.
  const deltas = useMemo(
    () => ratingDeltaByKey(filtered, (w) => w.film?.genres ?? []),
    [filtered],
  );

  return (
    <>
      <RankedBars
        bars={bars}
        total={filteredWatchlist.length}
        active={filters.genreTag}
        onPick={setGenreTag}
        deltas={deltas}
        ariaLabel="Watchlist films per genre, with how I rate films I have already seen in each"
      />
      <ChartTakeaway>
        films carry several genres each &middot; deviation from films I&rsquo;ve seen
      </ChartTakeaway>
    </>
  );
}
