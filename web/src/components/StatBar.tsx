"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { computeScreenTime, computeAvgRating, formatScreenTime } from "@/lib/stats";

export function StatBar() {
  const { all, filtered } = useExplorer();

  const stats = useMemo(() => {
    const totalMin = computeScreenTime(filtered);
    const allMin = computeScreenTime(all);
    const screen = formatScreenTime(totalMin);
    const rating = computeAvgRating(filtered);
    const isFiltered = filtered.length < all.length;
    const screenPct = allMin > 0 ? Math.round((totalMin / allMin) * 100) : 100;
    const watchPct = all.length > 0 ? Math.round((filtered.length / all.length) * 100) : 100;
    return { screen, watchCount: filtered.length, rating, isFiltered, screenPct, watchPct };
  }, [all, filtered]);

  const fmtNum = (v: number) => v % 1 === 0 ? `${v}` : v.toFixed(1);
  const ratingDisplay = stats.rating.mean != null
    ? stats.rating.ci != null && stats.rating.ci <= 5
      ? `${Math.round(stats.rating.mean)} ±${fmtNum(Math.round(stats.rating.ci * 10) / 10)}`
      : `${Math.round(stats.rating.mean)}`
    : "—";

  return (
    <div
      className="flex justify-between gap-2 pt-2"
    >
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight lg:text-xl" style={{ color: "#c01023" }}>
          {stats.screen.value}<span className="text-sm font-normal lg:text-base"> {stats.screen.unit}</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          screen time
        </div>
        {stats.isFiltered && (
          <div className="font-mono text-[9px] text-[#8b8981]">{stats.screenPct}% of total</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">{stats.watchCount}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          watches
        </div>
        {stats.isFiltered && (
          <div className="font-mono text-[9px] text-[#8b8981]">{stats.watchPct}% of total</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-[#0b0b0b] lg:text-xl">{ratingDisplay}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#67655f]">
          avg rating
        </div>
      </div>
    </div>
  );
}
