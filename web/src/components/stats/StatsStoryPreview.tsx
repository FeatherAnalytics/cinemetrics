"use client";

import { ExplorerProvider, useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import { SelectionPanel } from "@/components/SelectionPanel";
import type { Dataset } from "@/lib/types";
import { MonthlyPace } from "./MonthlyPace";
import { WeekdayCounts } from "./WeekdayCounts";
import { ViewingsToDate } from "./ViewingsToDate";
import { MostRewatched, MostRewatchedBlurb } from "./MostRewatched";
import { ViewingVelocity } from "./ViewingVelocity";
import { CumulativeWatches } from "./CumulativeWatches";
import { GenrePairing } from "./GenrePairing";
import { RatingsByGenre } from "./RatingsByGenre";

/**
 * What the stats story will look like, minus the story machinery.
 *
 * The chips, the `mode` swap on CHART_SECTIONS and the filter rail are all still
 * to come (see thoughts/STATS-STORY-SWAP.md). What this proves out is the part
 * that had never been tested: that these eight charts share the store, respond
 * to each other's selections, and drive the same SelectionPanel the main page
 * uses.
 */

type Section = {
  id: string;
  title: string;
  blurb: string;
  /** Blurbs that quote live numbers render as a component, so the sentence and
   *  the chart cannot disagree after a filter. */
  Blurb?: () => React.JSX.Element | null;
  Chart: () => React.JSX.Element | null;
};

const SECTIONS: Section[] = [
  {
    id: "velocity",
    title: "Viewing velocity",
    blurb:
      "Every {grain} since the first logged watch. No smoothing: each bar is exactly what happened.",
    Chart: ViewingVelocity,
  },
  {
    id: "cumulative",
    title: "Cumulative watches",
    blurb:
      "The running total, stacked.",
    Chart: CumulativeWatches,
  },
  {
    id: "ytd",
    title: "Viewings to date",
    blurb:
      "One line per year. Lines stop at each year's final watch.",
    Chart: ViewingsToDate,
  },
  {
    id: "rewatched",
    title: "What I go back to",
    blurb: "",
    Blurb: MostRewatchedBlurb,
    Chart: MostRewatched,
  },
  {
    id: "monthly",
    title: "Pace by month",
    blurb:
      "How many days pass between films per calendar month. Normalized against the days of each month.",
    Chart: MonthlyPace,
  },
  {
    id: "weekday",
    title: "Pace by weekday",
    blurb:
      "",
    Chart: WeekdayCounts,
  },
  {
    id: "genrebox",
    title: "Ratings by primary genre",
    blurb:
      "Every genre's median lands within half a star of every other.",
    Chart: RatingsByGenre,
  },
  {
    id: "pairing",
    title: "Genre pairing",
    blurb:
      "Which genre combinations show up and how they rate. Self-pairs excluded. Pale cells are backed by a single film.",
    Chart: GenrePairing,
  },
];

function Inner() {
  const { all, filtered, filters, reset } = useExplorer();
  const isFiltered = filtered.length !== all.length;

  return (
    <main className="mx-auto max-w-[820px] px-6 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold" style={{ color: INK.primary }}>
        The stats
      </h1>
      <p className="mb-3 max-w-[68ch] text-sm" style={{ color: INK.muted }}>
        Preview of the stats story: the promoted charts, sharing one store. Click any bar, cell,
        box or year label to cross-filter every other chart and fill the selection panel. Click the
        same mark again to clear. Story chips and the filter rail are not wired yet.
      </p>
      <p className="mb-8 font-mono text-[11px]" style={{ color: INK.muted }}>
        {filtered.length} of {all.length} watches
        {isFiltered && (
          <>
            {" · "}
            <button onClick={reset} className="underline" style={{ color: ACCENT }}>
              clear
            </button>
          </>
        )}
      </p>

      <div className="grid gap-10">
        {(filters.selection || filters.country) && <SelectionPanel />}

        {SECTIONS.map(({ id, title, blurb, Blurb, Chart }) => (
          <section key={id} id={`stat-${id}`} className="scroll-mt-6">
            <h2 className="font-display text-lg font-semibold" style={{ color: INK.primary }}>
              {title}
            </h2>
            <p className="mb-3 max-w-2xl text-xs" style={{ color: INK.muted }}>
              {Blurb ? <Blurb /> : blurb}
            </p>
            <Chart />
          </section>
        ))}
      </div>
    </main>
  );
}

export function StatsStoryPreview({ data }: { data: Dataset }) {
  return (
    <ExplorerProvider data={data}>
      <Inner />
    </ExplorerProvider>
  );
}
