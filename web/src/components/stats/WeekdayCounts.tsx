"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { chicagoParts, DAY_ABBR, WEEKEND } from "@/lib/statsChart";
import { CategoryBars, type CategoryBar } from "./CategoryBars";
import { accentFor, isPicked, pickWatches } from "./pick";

/**
 * Watch count by weekday.
 *
 * Count only, no pace version: unlike the monthly chart there is nothing to
 * normalize away, since every weekday recurs almost the same number of times
 * across seven years where months differ by up to three days each. A pace
 * version was built and dropped for redrawing the identical shape.
 *
 * Under the axis each day carries its distance from the median day as a
 * PERCENTAGE. An absolute gap was tried and cut: the bars are already drawn
 * against a median gridline, so "+47" was printing a distance the reader could
 * see. "+44%" is the part the eye cannot do, and it states the gap against the
 * level it departs from rather than against nothing.
 */
export function WeekdayCounts() {
  const { filtered, filters, setSelection } = useExplorer();

  const model = useMemo(() => {
    const counts = Array(7).fill(0) as number[];
    const byDay: (typeof filtered)[] = Array.from({ length: 7 }, () => []);
    for (const w of filtered) {
      const { dow } = chicagoParts(w.date);
      counts[dow] += 1;
      byDay[dow].push(w);
    }
    return { counts, byDay };
  }, [filtered]);

  const bars: CategoryBar[] = DAY_ABBR.map((label, i) => ({
    label,
    value: model.counts[i],
    title: `${label}: ${model.counts[i]} watches`,
    keys: [],
  }));

  const activeIndex = model.byDay.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        watches
      </div>
      <CategoryBars
        bars={bars}
        highlight={WEEKEND}
        showShare
        accent={accentFor(filters.genres)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(model.byDay[i], filters.selection, setSelection)}
      />
    </div>
  );
}
