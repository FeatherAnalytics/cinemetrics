"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
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
  const { tokens } = useTheme();
  const [hover, setHover] = useState<number | null>(null);

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

  const bars: CategoryBar[] = MONTH_ABBR.map((label, i) => ({
    label,
    value: model.exposure[i] ? model.counts[i] / model.exposure[i] : 0,
  }));

  const activeIndex = model.byMonth.findIndex((ws) => isPicked(ws, filters.selection));

  return (
    <div>
      {/* The hover readout is the AVERAGE RATING, and only that. The counts and
          the exposure days are already the bar; a tooltip restating them would
          be printing the picture back at the reader. The rating is the one
          thing the chart cannot show, and it is the whole point of the story:
          the pace swings threefold and this number does not move.

          It renders in the chart's own strip, in the site's type, matching the
          cumulative chart. There is no `<title>` anywhere in this chart. */}
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: tokens.ink.muted }}
      >
        {hover != null && model.avg[hover] != null ? (
          <>
            {MONTH_ABBR[hover]} avg{" "}
            <span style={{ color: tokens.ink.primary }}>
              {(model.avg[hover]! / 20).toFixed(1)}★
            </span>
          </>
        ) : (
          "days between films"
        )}
      </div>
      <CategoryBars
        bars={bars}
        fmt={paceLabel}
        accent={accentFor(filters.genres, tokens)}
        active={activeIndex >= 0 ? activeIndex : null}
        onHover={setHover}
        onPick={(i) => pickWatches(model.byMonth[i], filters.selection, setSelection)}
      />
    </div>
  );
}
