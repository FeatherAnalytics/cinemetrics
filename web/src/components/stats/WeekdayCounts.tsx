"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
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
 * Each bar is labeled with its distance from the median day as a PERCENTAGE,
 * not with its count. The y axis already runs 0 to the peak with the median
 * marked, so a count on the bar as well was the same number printed twice.
 * The percentage is the part the axis cannot give.
 */
export function WeekdayCounts() {
  const { filtered, filters, setSelection } = useExplorer();
  const { tokens } = useTheme();

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

  // No hover. The bar, its value and its percentage against the median are all
  // already on screen, so there is nothing left for a hover to say.
  const bars: CategoryBar[] = DAY_ABBR.map((label, i) => ({
    label,
    value: model.counts[i],
  }));

  const activeIndex = model.byDay.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: tokens.ink.muted }}
      >
        watches
      </div>
      <CategoryBars
        bars={bars}
        highlight={WEEKEND}
        barLabel="share"
        accent={accentFor(filters.genres, tokens)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(model.byDay[i], filters.selection, setSelection)}
      />
    </div>
  );
}
