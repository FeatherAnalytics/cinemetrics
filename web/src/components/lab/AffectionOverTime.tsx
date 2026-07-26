"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { likedByWatchYear, likedRate } from "@/lib/likedChart";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";
import { RateBars, type RateBar } from "./RateBars";
import type { EnrichedWatch } from "@/lib/types";

/**
 * The affection rate by year of watching.
 *
 * Reads as a habit forming: 41% in 2020 against 61% so far in 2026. Treat it as
 * a description of the LOG rather than of the viewing. The heart is a
 * film-level toggle on Letterboxd, applied whenever I happen to press it and
 * then stamped onto every diary entry for that film, so a heart given today
 * lands on a watch from 2020 and the early years are not a clean record of what
 * I felt at the time. The drift is real; its cause is not established here.
 */
export function AffectionOverTime() {
  const { filtered, filters, setSelection } = useExplorer();

  const { bars, groups } = useMemo(() => {
    const years = likedByWatchYear(filtered);
    const byYear = new Map<number, EnrichedWatch[]>();
    for (const w of filtered) {
      if (w.liked == null) continue;
      const y = Number(w.date.slice(0, 4));
      const bucket = byYear.get(y);
      if (bucket) bucket.push(w);
      else byYear.set(y, [w]);
    }
    return {
      bars: years.map(
        (y): RateBar => ({ label: String(y.year), rate: y.rate.rate, n: y.rate.n }),
      ),
      groups: years.map((y) => byYear.get(y.year) ?? []),
    };
  }, [filtered]);

  const overall = likedRate(filtered);
  const activeIndex = groups.findIndex((ws) => isPicked(ws, filters.selection));

  if (!bars.length) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        No year under this filter recorded enough hearts to rate.
      </p>
    );
  }

  return (
    <div>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        hearted, by year watched
      </div>
      <RateBars
        bars={bars}
        accent={accentFor(filters.genres)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(groups[i], filters.selection, setSelection)}
        refAt={overall.rate}
        refLabel={`all years ${Math.round(overall.rate * 100)}%`}
      />
    </div>
  );
}
