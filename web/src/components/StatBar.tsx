"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import {
  computeAvgRating,
  computeAvgRuntime,
  computeRewatchShare,
  computeScreenTime,
  formatScreenTime,
} from "@/lib/stats";
import { fmt1 } from "@/lib/format";
import { ACCENT } from "@/lib/palette";
import type { WatchlistFilm } from "@/lib/types";

export function StatBar() {
  const { all, filtered, activeStory, watchlist, filteredWatchlist } = useExplorer();

  const stats = useMemo(() => {
    const totalMin = computeScreenTime(filtered);
    const allMin = computeScreenTime(all);
    const screen = formatScreenTime(totalMin);
    const rating = computeAvgRating(filtered);
    const isFiltered = filtered.length < all.length;
    const screenPct = allMin > 0 ? Math.round((totalMin / allMin) * 100) : 100;
    const watchPct = all.length > 0 ? Math.round((filtered.length / all.length) * 100) : 100;
    return {
      screen,
      watchCount: filtered.length,
      rating,
      isFiltered,
      screenPct,
      watchPct,
      avgRuntime: computeAvgRuntime(filtered),
      rewatchShare: computeRewatchShare(filtered),
    };
  }, [all, filtered]);

  // Standard deviation: how spread out the ratings are. Labeled "sd" explicitly
  // because the headline figure already carries a bare ±, which is the confidence
  // interval of the mean. Different quantity, so it needs a different label.
  const spread =
    stats.rating.sd != null && stats.rating.sd > 0
      ? `±${Math.round(stats.rating.sd)} sd`
      : null;

  const ratingDisplay = stats.rating.mean != null
    ? stats.rating.ci != null && stats.rating.ci <= 5
      ? `${Math.round(stats.rating.mean)} ±${fmt1(Math.round(stats.rating.ci * 10) / 10)}`
      : `${Math.round(stats.rating.mean)}`
    : "—";

  // Every tile above describes the watch LOG — hours watched, rewatch share,
  // average rating. None of that exists for a film nobody has watched, so while
  // the watchlist story is up the tiles report the queue instead of sitting
  // there stating figures from a dataset the charts below are not showing.
  if (activeStory === "watchlist") {
    return <WatchlistStats films={filteredWatchlist} total={watchlist.length} />;
  }

  return (
    <div
      className="flex justify-between gap-2 pt-2"
    >
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight lg:text-xl" style={{ color: ACCENT }}>
          {stats.screen.value}<span className="text-sm font-normal lg:text-base"> {stats.screen.unit}</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          screen time
        </div>
        {stats.avgRuntime != null && (
          <div className="font-mono text-[9px] text-[#67655f]">
            {Math.round(stats.avgRuntime)} min avg
          </div>
        )}
        {stats.isFiltered && (
          <div className="font-mono text-[9px] text-[#67655f]">{stats.screenPct}% of total</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">{stats.watchCount}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          watches
        </div>
        {stats.rewatchShare != null && (
          <div className="font-mono text-[9px] text-[#67655f]">
            {Math.round(stats.rewatchShare * 100)}% rewatches
          </div>
        )}
        {stats.isFiltered && (
          <div className="font-mono text-[9px] text-[#67655f]">{stats.watchPct}% of total</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">{ratingDisplay}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          avg rating
        </div>
        {spread && <div className="font-mono text-[9px] text-[#67655f]">{spread}</div>}
      </div>
    </div>
  );
}

/**
 * The same three tiles, measured against the watchlist.
 *
 * "Time to clear" is the runtime tile's counterpart: the log's version asks how
 * long has been spent, so the queue's asks how long is owed. It sums only the
 * films that declare a runtime and says how many did, because a total quietly
 * missing a few films is a smaller number presented as a complete one.
 *
 * The third tile is the already-watched count rather than a rating, since the
 * queue has no ratings — and it is the one number on this page a reader most
 * needs to see, because it is why "136 films" and "130 waiting" differ.
 */
function WatchlistStats({ films, total }: { films: WatchlistFilm[]; total: number }) {
  const withRuntime = films.filter((f) => f.runtime != null);
  const minutes = withRuntime.reduce((sum, f) => sum + (f.runtime ?? 0), 0);
  const screen = formatScreenTime(minutes);
  const watched = films.filter((f) => f.watched).length;
  const isFiltered = films.length < total;

  return (
    <div className="flex justify-between gap-2 pt-2">
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight lg:text-xl" style={{ color: ACCENT }}>
          {screen.value}
          <span className="text-sm font-normal lg:text-base"> {screen.unit}</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          time to clear
        </div>
        {withRuntime.length < films.length && (
          <div className="font-mono text-[9px] text-[#67655f]">
            {withRuntime.length} of {films.length} timed
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">
          {films.length}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          on the list
        </div>
        {isFiltered && (
          <div className="font-mono text-[9px] text-[#67655f]">
            {Math.round((100 * films.length) / total)}% of total
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">{watched}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          already seen
        </div>
        <div className="font-mono text-[9px] text-[#67655f]">not cleared off</div>
      </div>
    </div>
  );
}
