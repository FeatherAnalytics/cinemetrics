"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import {
  chicagoParts,
  calendarDaysPerMonth,
  MONTH_ABBR,
  paceLabel,
} from "@/lib/statsChart";
import { CategoryBars, type CategoryBar } from "./CategoryBars";
import { accentFor, isPicked, pickWatches } from "./pick";

/**
 * Watch pace by calendar month.
 *
 * READ THE ENCODING BEFORE WRITING COPY ABOUT THIS CHART. Bar height is the
 * RATE, watches per calendar day, so the TALLEST bar is the busiest month.
 * Only the label inverts, printing the rate's reciprocal as days between
 * films, which means the tallest bar carries the SMALLEST number: October is
 * the tallest bar and reads 1.7, January is short and reads 3.3. Plotting
 * days-per-film as the height would put the busiest month at the bottom, and
 * an inverted axis fighting the reader's intuition is what sank an earlier
 * version. See `paceLabel`.
 *
 * A raw count would penalize February, which is up to three days shorter than
 * January. The denominator is whole calendar months over the observed range,
 * not the days that happened to have a watch on them, so a part-month at
 * either end cannot read as a busy one.
 */
export function MonthlyPace() {
  const { all, filtered, filters, setSelection } = useExplorer();

  const model = useMemo(() => {
    const counts = Array(12).fill(0) as number[];
    const sums = Array(12).fill(0) as number[];
    const rated = Array(12).fill(0) as number[];
    const byMonth: (typeof filtered)[] = Array.from({ length: 12 }, () => []);
    for (const w of filtered) {
      const { month } = chicagoParts(w.date);
      counts[month] += 1;
      byMonth[month].push(w);
      if (w.rating != null) {
        sums[month] += w.rating;
        rated[month] += 1;
      }
    }
    // Whole calendar months, and from the FULL history rather than the filtered
    // subset: a filter removes watches, never the days they could have happened on.
    const exposure = calendarDaysPerMonth(all.map((w) => w.date));
    const avg = rated.map((n, i) => (n ? sums[i] / n : null));
    return { counts, byMonth, exposure, avg };
  }, [all, filtered]);

  // The rating lives ONLY here, on hover. It used to ride the story headline as
  // "and rate them 1 point apart", which spent a headline on a non-finding: the
  // whole point is that the rating does not move, so it belongs where a reader
  // who wonders can check it, not where everyone has to read it.
  const bars: CategoryBar[] = MONTH_ABBR.map((label, i) => {
    const a = model.avg[i];
    return {
      label,
      value: model.exposure[i] ? model.counts[i] / model.exposure[i] : 0,
      title:
        `${label}: ${model.counts[i]} watches over ${model.exposure[i]} calendar days` +
        (a != null ? ` · avg rating ${Math.round(a)}` : ""),
      keys: [],
    };
  });

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
        accent={accentFor(filters.genres)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(model.byMonth[i], filters.selection, setSelection)}
      />
    </div>
  );
}
