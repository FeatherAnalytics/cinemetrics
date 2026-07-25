"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import {
  anova,
  anovaCaption,
  chicagoParts,
  calendarDaysPerMonth,
  MONTH_ABBR,
  paceLabel,
} from "@/lib/statsChart";
import { CategoryBars, type CategoryBar } from "./CategoryBars";
import { isPicked, pickWatches } from "./pick";

/**
 * Watch PACE by calendar month: how many days pass between films.
 *
 * A raw count penalizes February, which is up to three days shorter than
 * January. The denominator is not a flat 31/30/28 but the days of each month
 * that actually fall inside the observed range, so leap days and the partial
 * months at either end are handled by construction.
 */
export function MonthlyPace() {
  const { all, filtered, filters, setSelection } = useExplorer();

  const model = useMemo(() => {
    const counts = Array(12).fill(0) as number[];
    const ratings: number[][] = Array.from({ length: 12 }, () => []);
    const byMonth: (typeof filtered)[] = Array.from({ length: 12 }, () => []);
    for (const w of filtered) {
      const { month } = chicagoParts(w.date);
      counts[month] += 1;
      byMonth[month].push(w);
      if (w.rating != null) ratings[month].push(w.rating);
    }
    // Whole calendar months, and from the FULL history rather than the filtered
    // subset: a filter removes watches, never the days they could have happened on.
    const exposure = calendarDaysPerMonth(all.map((w) => w.date));
    return { counts, ratings, byMonth, exposure, test: anova(ratings) };
  }, [all, filtered]);

  const bars: CategoryBar[] = MONTH_ABBR.map((label, i) => ({
    label,
    value: model.exposure[i] ? model.counts[i] / model.exposure[i] : 0,
    title: `${label}: ${model.counts[i]} watches over ${model.exposure[i]} calendar days`,
    keys: [],
  }));

  const activeIndex = model.byMonth.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        days between films
      </div>
      <CategoryBars
        bars={bars}
        fmt={paceLabel}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(model.byMonth[i], filters.selection, setSelection)}
      />
      <p className="mt-1 max-w-[68ch] text-xs leading-snug" style={{ color: INK.muted }}>
        {anovaCaption(model.test, "Month")}
      </p>
    </div>
  );
}
