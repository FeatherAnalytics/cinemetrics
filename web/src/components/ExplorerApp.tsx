"use client";

import { useEffect, useRef, useState } from "react";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { RecommendProvider, useRecommend } from "@/lib/recommendStore";
import { RecommendDrawer } from "@/components/RecommendDrawer";
import { FilterBar } from "@/components/FilterBar";
import { SwimLaneChart } from "@/components/SwimLaneChart";
import { ResidualDotStack } from "@/components/ResidualDotStack";
import { StreakStripes } from "@/components/StreakStripes";
import { KeywordBars } from "@/components/KeywordBars";
import { CountryBars } from "@/components/CountryBars";
import { RewatchCadence } from "@/components/RewatchCadence";
import { FranchiseRuns } from "@/components/FranchiseRuns";
import { RollingRating } from "@/components/RollingRating";
import { SelectionPanel } from "@/components/SelectionPanel";
import { StatBar } from "@/components/StatBar";
import { StoryAnnotation } from "@/components/StoryAnnotation";
import { StoryChartNote } from "@/components/StoryChartNote";
import { StoryChips } from "@/components/StoryChips";
import { CopyChartLink } from "@/components/CopyChartLink";
import { Footer } from "@/components/Footer";
import type { ChartId } from "@/lib/stories";
import type { Dataset } from "@/lib/types";
import type { ReactNode } from "react";

type ChartSection = {
  id: ChartId;
  title: string;
  blurbClass: string;
  blurb: ReactNode;
  Chart: () => React.JSX.Element;
};

// Section order and copy are load-bearing — the story chips dim charts by id and
// the narrative reads top to bottom. Keep this array in sync with StoryAnnotation
// targets and the ChartId union.
const CHART_SECTIONS: ChartSection[] = [
  {
    id: "spiral",
    title: "When I watch",
    blurbClass: "mb-2 text-xs text-[#67655f]",
    blurb: (
      <>
        One row per year, January to December. Height within a row is my rating.
        Dots above the upper guide line scored 75+, dots below the lower one under 25.
      </>
    ),
    Chart: SwimLaneChart,
  },
  {
    id: "contrarian",
    title: "Me versus the critics",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Each dot is a film, stacked by how far my rating sits from a prediction from a
        regression fit on Metacritic, Rotten Tomatoes, and IMDB scores. Dots right of
        zero are films I liked more than the critics suggest; left, less. Click a dot to
        trace that film; drag to select a range.
      </>
    ),
    Chart: ResidualDotStack,
  },
  {
    id: "keywords",
    title: "The keywords that give me away",
    blurbClass: "mb-3 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        After controlling for critic scores, keywords where I systematically rate
        higher or lower than critics predict. Click a bar to see those films.
      </>
    ),
    Chart: KeywordBars,
  },
  {
    id: "countries",
    title: "What travels well",
    blurbClass: "mb-2 text-xs text-[#67655f]",
    blurb: (
      <>
        Countries ranked by how many of my films they helped produce, coloured by the genre
        I watch most from each. The right column shows how I rate that country&rsquo;s films
        against prediction. Click a row to filter the other charts.
      </>
    ),
    Chart: CountryBars,
  },
  {
    id: "stripes",
    title: "Streaks and slumps",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        The whole log as a barcode: one stripe per rated watch, in order.
        Crimson when I scored it above my median, blue below, pale at par.
      </>
    ),
    Chart: StreakStripes,
  },
  {
    id: "rolling",
    title: "Warming up or wearing out",
    blurbClass: "mb-3 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        One panel per group: the coloured line is my rolling {10}-watch average rating as
        I work through that group; the dashed grey line is my overall average, so stretches
        above it are runs where that group was beating my baseline. Switch how the films are
        grouped: genre, language, country, runtime, release decade, or content rating.
      </>
    ),
    Chart: RollingRating,
  },
  {
    id: "rewatch",
    title: "Second thoughts",
    blurbClass: "mb-4 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Films I&rsquo;ve returned to, grouped by whether coming back changed my mind.
        Biggest rating swings first. Every dot is a watch, placed left-to-right by date and
        up-or-down by my rating; the numbers at the right of a row are my first and latest
        scores.
      </>
    ),
    Chart: RewatchCadence,
  },
  {
    id: "franchise",
    title: "Franchise runs",
    blurbClass: "mb-4 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        One row per franchise I&rsquo;ve watched at least two entries of, most-watched
        first; the count after each name is how many entries I&rsquo;ve seen. Dots are
        watches over time, height is my rating; the number at the right is my average
        for that franchise.
      </>
    ),
    Chart: FranchiseRuns,
  },
];

// Small spans read better as words ("Seven years"); past twelve, digits win.
const SPAN_WORDS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve",
];

function spanWord(n: number): string {
  return SPAN_WORDS[n] ?? String(n);
}

function Explorer() {
  const { storyFocus, activeStory, films, all, yearBounds } = useExplorer();
  const { state: recState } = useRecommend();
  const [drawerOpenRaw, setDrawerOpen] = useState(false);
  const drawerOpen = drawerOpenRaw && !recState.open;

  const [startYear, endYear] = yearBounds;
  const years = endYear - startYear + 1;

  // Desktop filter sidebar collapses to a thin rail while a story is active:
  // the story drives the filters, so the rail is idle, and the charts use the
  // full width for the story's highlights. Restores when the story clears; the
  // user can still toggle manually until the next story change. Adjusted during
  // render (not in an effect) so it tracks activeStory changes.
  const [collapsed, setCollapsed] = useState(false);
  const [prevStory, setPrevStory] = useState(activeStory);
  if (activeStory !== prevStory) {
    setPrevStory(activeStory);
    setCollapsed(!!activeStory);
  }

  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      drawerCloseRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setDrawerOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [drawerOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const chartStyle = (id: ChartId): React.CSSProperties =>
    storyFocus?.dim.includes(id)
      ? { opacity: 0.4, pointerEvents: "none", transition: "opacity 0.3s" }
      : {};

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#67655f]">
          a personal film log · {startYear}–{endYear}
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#0b0b0b]">
          cinemetrics<span style={{ color: "#c01023" }}>.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#3d3c38]">
          {spanWord(years)} {years === 1 ? "year" : "years"}, {films.length} films, and{" "}
          {all.length} watches, scored on my own scale and lined up against the critics.
          A few things the numbers turned up. Tap one to see it on the charts:
        </p>
        <div className="mt-3">
          <StoryChips />
        </div>
        <p className="mt-3 max-w-2xl text-xs text-[#67655f]">
          Or explore freely: every control cross-filters all the charts, and clicking a film
          traces it across them.
        </p>
      </header>

      {/* Mobile-only trigger: opens the filter drawer. */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg lg:hidden"
        style={{ background: "#c01023", color: "#f7f6f3" }}
        aria-label="Open filters"
      >
        <span aria-hidden>☰</span> Filters
      </button>

      {/* Scrim behind the mobile drawer. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <div className="lg:flex lg:gap-8">
        {/* Collapsed desktop rail: a thin strip that reopens the sidebar. */}
        {collapsed && (
          <div className="hidden lg:block lg:shrink-0">
            <button
              onClick={() => setCollapsed(false)}
              className="lg:sticky lg:top-6 flex h-10 w-10 items-center justify-center rounded-lg border text-[#3d3c38] hover:text-[#0b0b0b]"
              style={{ borderColor: "rgba(11,11,11,0.14)", background: "#f7f6f3" }}
              aria-label="Expand filters"
              aria-expanded={false}
            >
              <span aria-hidden>☰</span>
            </button>
          </div>
        )}

        {/* One panel, two lives: a sticky sidebar at lg, a slide-in drawer below it. */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm transform overflow-y-auto p-4 shadow-xl transition-transform duration-300 lg:static lg:z-auto lg:mb-0 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:overflow-visible lg:p-0 lg:shadow-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          } ${collapsed ? "lg:hidden" : "lg:w-72"}`}
          style={{ background: "#f7f6f3" }}
          aria-label="Filters"
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen || undefined}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#67655f]">Filters</span>
            <button
              ref={drawerCloseRef}
              onClick={() => setDrawerOpen(false)}
              className="rounded-full px-2 py-1 text-lg leading-none text-[#3d3c38] hover:text-[#0b0b0b]"
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>
          <div
            className="rounded-lg border p-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
            style={{ borderColor: "rgba(11,11,11,0.14)" }}
          >
            <div className="mb-2 hidden justify-end lg:flex">
              <button
                onClick={() => setCollapsed(true)}
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#67655f] hover:text-[#0b0b0b]"
              >
                <span aria-hidden>« </span>hide
              </button>
            </div>
            <StatBar />
            <div className="my-3 border-t" style={{ borderColor: "rgba(11,11,11,0.1)" }} />
            <FilterBar />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="grid gap-8">
            <SelectionPanel />

            {CHART_SECTIONS.map(({ id, title, blurbClass, blurb, Chart }) => (
              <section key={id} id={`chart-${id}`} className="scroll-mt-6" style={chartStyle(id)}>
                <div className="min-w-0">
                  <h2 className="group flex items-center gap-2 font-display text-lg font-semibold text-[#0b0b0b]">
                    {title}
                    <CopyChartLink anchor={`chart-${id}`} title={title} />
                  </h2>
                  <p className={blurbClass}>{blurb}</p>
                  {/* Story prose sits between the blurb and the chart: the
                      headline bar on the story's primary chart, a matching
                      note block on secondary charts. Charts keep full width. */}
                  <StoryAnnotation target={id} />
                  <StoryChartNote target={id} />
                  <Chart />
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <Footer />
      <RecommendDrawer />
    </main>
  );
}

export function ExplorerApp({ data }: { data: Dataset }) {
  return (
    <ExplorerProvider data={data}>
      <RecommendProvider>
        <Explorer />
      </RecommendProvider>
    </ExplorerProvider>
  );
}
