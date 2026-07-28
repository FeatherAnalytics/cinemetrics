"use client";

import { useEffect, useRef, useState } from "react";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { eyebrow, summaryLine } from "@/lib/summary";
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
import { ViewingVelocity } from "@/components/stats/ViewingVelocity";
import { CumulativeWatches } from "@/components/stats/CumulativeWatches";
import { ViewingsToDate } from "@/components/stats/ViewingsToDate";
import { MostRewatched, MostRewatchedBlurb } from "@/components/stats/MostRewatched";
import { MonthlyPace } from "@/components/stats/MonthlyPace";
import { WeekdayCounts } from "@/components/stats/WeekdayCounts";
import { RatingsByGenre } from "@/components/stats/RatingsByGenre";
import { GenrePairing } from "@/components/stats/GenrePairing";
import { RatingDistribution } from "@/components/stats/RatingDistribution";
import { FavPosters } from "@/components/lab/FavPosters";
import { LikedByRating, LikedByRatingBlurb } from "@/components/lab/LikedByRating";
import { WhatMovesTheHeart } from "@/components/lab/WhatMovesTheHeart";
import {
  FavsAmongTheBest,
  FavsAmongTheBestBlurb,
} from "@/components/lab/FavsAmongTheBest";
import { FavDirectors, FavDirectorsBlurb } from "@/components/lab/FavDirectors";
import { SelectionPanel } from "@/components/SelectionPanel";
import { StatBar } from "@/components/StatBar";
import { StoryAnnotation } from "@/components/StoryAnnotation";
import { StoryChartNote } from "@/components/StoryChartNote";
import { WatchlistDecades } from "@/components/watchlist/WatchlistDecades";
import { WatchlistBarcode } from "@/components/watchlist/WatchlistBarcode";
import { WatchlistGenres } from "@/components/watchlist/WatchlistGenres";
import { WatchlistKeywords } from "@/components/watchlist/WatchlistKeywords";
import { WatchlistOrigin } from "@/components/watchlist/WatchlistOrigin";
import { StoryChips } from "@/components/StoryChips";
import { CopyChartLink } from "@/components/CopyChartLink";
import { Footer } from "@/components/Footer";
import {
  chartSetFor,
  hiddenCharts,
  swapsChartSet,
  type ChartId,
  type ChartSet,
} from "@/lib/stories";
import type { Dataset } from "@/lib/types";
import type { ReactNode } from "react";

type ChartSection = {
  id: ChartId;
  title: string;
  blurbClass: string;
  blurb: ReactNode;
  /**
   * Replacement copy while the heart lens is on.
   *
   * Not optional decoration: the lens REPLACES what several of these charts
   * encode, so the shipped blurb becomes actively wrong. The barcode's says
   * "crimson when I scored it above my median", which under the lens describes a
   * color the chart is no longer drawing, and wrong copy about a chart is worse
   * than none because it teaches the reader to misread the picture.
   */
  heartBlurb?: ReactNode;
  // Several stats charts return null when a filter empties them out.
  Chart: () => React.JSX.Element | null;
  /**
   * Which sets this chart appears in. Required, so no chart's placement is implied.
   *
   * A LIST rather than one value, because most charts appear in more than one set:
   * the favorites story keeps the narrative charts and recolors them, and three of
   * those charts also earn a place on the landing page. Order within a set comes
   * from this array's order, which is why it reads as the landing arc first and the
   * story-only charts after.
   */
  sets: ChartSet[];
};

// Section order and copy are load-bearing — the story chips dim charts by id and
// the narrative reads top to bottom. Keep this array in sync with StoryAnnotation
// targets and the ChartId union.
const CHART_SECTIONS: ChartSection[] = [
  // --- Shown at the top of EVERY set. ---
  // The shape of the scale every other chart is expressed in, so it comes before
  // the reader is asked to care when, where or against whom I watched.
  {
    id: "ratings",
    sets: ["landing", "narrative", "heart"],
    title: "How I rate",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <>Every rated watch, one column per half star.</>,
    Chart: RatingDistribution,
  },
  // --- The heart set. Only the favorites story shows these. ---
  {
    id: "favposters",
    title: "The four favorites",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        The four films on my Letterboxd profile, in the order they sit there.
      </>
    ),
    Chart: FavPosters,
    sets: ["heart"],
  },
  {
    id: "likedcurve",
    title: "The heart follows the rating",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <LikedByRatingBlurb />,
    Chart: LikedByRating,
    sets: ["heart"],
  },
  {
    id: "heartpredictors",
    title: "Nothing decides the ones in between",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Every watch with a recorded heart, grouped.
      </>
    ),
    Chart: WhatMovesTheHeart,
    sets: ["heart"],
  },
  {
    id: "favtie",
    title: "Four of nineteen",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <FavsAmongTheBestBlurb />,
    Chart: FavsAmongTheBest,
    sets: ["heart"],
  },
  {
    id: "favdirectors",
    title: "A favorite brings company",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <FavDirectorsBlurb />,
    Chart: FavDirectors,
    sets: ["heart"],
  },
  // --- The landing arc, in reading order. ---
  // Time first and at three zoom levels (the year as texture, the year against
  // other years, the whole run), then pace, then what I thought of it, then
  // whether I went back.
  {
    id: "spiral",
    sets: ["landing", "narrative", "heart"],
    title: "When I watch",
    blurbClass: "mb-2 text-xs text-[#67655f]",
    blurb: (
      <>
        One row per year, January to December. Height is my rating.
      </>
    ),
    heartBlurb: (
      <>
        Films I hearted hold their color. Everything else fades, 2019 included: it predates the heart entirely.
      </>
    ),
    Chart: SwimLaneChart,
  },
  {
    id: "ytd",
    sets: ["landing"],
    title: "Viewings to date",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        One line per year, each restarting in January. Lines stop at each year&rsquo;s
        final watch.
      </>
    ),
    Chart: ViewingsToDate,
  },
  {
    id: "cumulative",
    sets: ["landing"],
    title: "Cumulative watches",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        The running total, stacked by genre.
      </>
    ),
    Chart: CumulativeWatches,
  },
  {
    id: "velocity",
    sets: ["landing"],
    title: "Viewing velocity",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <>Every bucket since the first logged watch. No smoothing.</>,
    Chart: ViewingVelocity,
  },
  {
    id: "monthly",
    sets: ["landing"],
    title: "Pace by month",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Watches per calendar day, so a taller bar is a busier month.
      </>
    ),
    Chart: MonthlyPace,
  },
  {
    id: "weekday",
    sets: ["landing"],
    title: "Pace by weekday",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Watches by day, weekend tinted.
      </>
    ),
    Chart: WeekdayCounts,
  },
  {
    id: "genrebox",
    sets: ["landing"],
    title: "Ratings by primary genre",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <>Tukey box plots, one value per film, each film in exactly one genre.</>,
    Chart: RatingsByGenre,
  },
  {
    id: "rewatched",
    sets: ["landing"],
    title: "What I go back to",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: <MostRewatchedBlurb />,
    Chart: MostRewatched,
  },
  {
    id: "rewatch",
    sets: ["landing", "narrative", "heart"],
    title: "Second thoughts",
    blurbClass: "mb-4 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Films I returned to, grouped by whether coming back changed my mind. Biggest swings first.
      </>
    ),
    heartBlurb: (
      <>
        Second thoughts on films I already loved: hearted, and returned to at least once.
      </>
    ),
    Chart: RewatchCadence,
  },
  // --- Story-only. These earn their place inside a story and nowhere else. ---
  {
    id: "contrarian",
    sets: ["narrative", "heart"],
    title: "Me versus the critics",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Each film, placed by how far my rating sits from the critics&rsquo; prediction.
      </>
    ),
    heartBlurb: (
      <>
        Only the films I hearted, still placed against the full critics model.
      </>
    ),
    Chart: ResidualDotStack,
  },
  {
    id: "pairing",
    sets: ["narrative"],
    title: "Genre pairing",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Which genre combinations I actually watch, and how they rate.
      </>
    ),
    Chart: GenrePairing,
  },
  {
    id: "keywords",
    sets: ["narrative", "heart"],
    title: "The keywords that give me away",
    blurbClass: "mb-3 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Keywords I heart more often than I heart anything, and less. Distance from my overall rate, in points.
      </>
    ),
    Chart: KeywordBars,
  },
  {
    id: "countries",
    sets: ["narrative", "heart"],
    title: "What travels well",
    blurbClass: "mb-2 text-xs text-[#67655f]",
    blurb: (
      <>
        Countries by how many of my films they made. The right column is the heart, against
        my overall rate.
      </>
    ),
    Chart: CountryBars,
  },
  {
    id: "stripes",
    sets: ["narrative", "heart"],
    title: "Streaks and slumps",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        The whole log as a barcode, one stripe per rated watch, in order.
      </>
    ),
    heartBlurb: (
      <>
        The same barcode, colored by the heart instead of my rating.
      </>
    ),
    Chart: StreakStripes,
  },
  {
    id: "rolling",
    sets: ["narrative", "heart"],
    title: "Warming up or wearing out",
    blurbClass: "mb-3 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        My rolling {10}-watch average within each group, against my overall average.
      </>
    ),
    heartBlurb: (
      <>
        The same panels, hearted films only, against my average across everything hearted in
        view.
      </>
    ),
    Chart: RollingRating,
  },
  {
    id: "franchise",
    sets: ["narrative", "heart"],
    title: "Franchise runs",
    blurbClass: "mb-4 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        One row per franchise I have seen at least two entries of. Height is my rating.
      </>
    ),
    heartBlurb: (
      <>
        Only franchises holding a film I hearted. Runs I never loved an entry of drop out.
      </>
    ),
    Chart: FranchiseRuns,
  },

  // --- The watchlist set. Films with no viewing history, so none of the charts
  // above appears here: every one of them walks the watch log. ---
  {
    id: "wldecades",
    sets: ["watchlist"],
    title: "Release decade of films on the watchlist",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Films on the watchlist by release decade. Empty decades stay in, so the gaps
        are real gaps. Click a decade to filter the other charts to it.
      </>
    ),
    Chart: WatchlistDecades,
  },
  {
    id: "wlbarcode",
    sets: ["watchlist"],
    title: "Release dates of films on the watchlist",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        One stripe per film, left to right by release date, colored by genre. Spacing
        is real time, so a dense band is a run of years the watchlist keeps returning
        to and a gap is one it skips.
      </>
    ),
    Chart: WatchlistBarcode,
  },
  {
    id: "wlgenres",
    sets: ["watchlist"],
    title: "Watchlist by genre",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        How many watchlist films carry each genre. A film counts once in every genre
        it carries, so the bars add up to more than the number of films.
      </>
    ),
    Chart: WatchlistGenres,
  },
  {
    id: "wlorigin",
    sets: ["watchlist"],
    title: "Origins of the watchlist",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Production country or original language. The left bar is
        how many films are on the watchlist; the right is how far my rating for films I&rsquo;ve
        already seen from there sits from my average.
      </>
    ),
    Chart: WatchlistOrigin,
  },
  {
    id: "wlkeywords",
    sets: ["watchlist"],
    title: "Watchlist keywords",
    blurbClass: "mb-2 max-w-2xl text-xs text-[#67655f]",
    blurb: (
      <>
        Keywords shared by three or more films on the list. The right track is how I
        rate the films I&rsquo;ve already seen carrying that tag, against my average.
      </>
    ),
    Chart: WatchlistKeywords,
  },
];

function Explorer() {
  const { storyFocus, activeStory, films, yearBounds, heartLens } = useExplorer();
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
  //
  // A chart-set story is the exception. It sets no filters of its own, so the rail
  // is a live control there rather than idle chrome: the reader filters, and the
  // swapped-in charts recompute against the filtered set. Collapsing it would
  // hide the only thing there is to do with them.
  const [collapsed, setCollapsed] = useState(false);
  const [prevStory, setPrevStory] = useState(activeStory);
  if (activeStory !== prevStory) {
    setPrevStory(activeStory);
    setCollapsed(!!activeStory && !swapsChartSet(activeStory));
  }

  // Only a set swap leaves the reader's scroll offset pointing at a chart that no
  // longer exists. Every other story leaves the sections in place, where holding
  // position is the right behavior.
  useEffect(() => {
    if (swapsChartSet(activeStory)) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStory]);

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

  // A chart-set story swaps the page rather than dimming it. Which set it wants
  // is declared on the story, so a new set needs no branch here.
  const wanted = chartSetFor(activeStory);
  const hidden = hiddenCharts(activeStory);
  const sections = CHART_SECTIONS.filter(
    (s) => s.sets.includes(wanted) && !hidden.includes(s.id),
  );

  const chartStyle = (id: ChartId): React.CSSProperties =>
    storyFocus?.dim.includes(id)
      ? { opacity: 0.4, pointerEvents: "none", transition: "opacity 0.3s" }
      : {};

  return (
    // w-full is load-bearing: body is a column flex container, so mx-auto alone
    // leaves main shrink-to-fit. Any chart that measures its own column would
    // then pin the page to the width it first drew at.
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#67655f]">
          {eyebrow(startYear, endYear)}
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#0b0b0b]">
          cinemetrics<span style={{ color: "#c01023" }}>.</span>
        </h1>
        {/* Same sentence the share preview uses, from lib/summary. No instruction
            and no watch total: the stat bar prints that a few inches below, and
            telling a reader to tap a chip spends a line on something the chip's
            own arrow already says. */}
        <p className="mt-2 max-w-2xl text-sm text-[#3d3c38]">
          {summaryLine(years, films.length)}
        </p>
        <div className="mt-3">
          <StoryChips />
        </div>
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
          {/* grid-cols-1 keeps the track definite. A bare grid falls back to an
              implicit max-content column, which any width-measuring chart would
              then pin to whatever it first drew at. */}
          <div className="grid grid-cols-1 gap-8">
            <SelectionPanel />

            {sections.map(({ id, title, blurbClass, blurb, heartBlurb, Chart }) => (
              <section key={id} id={`chart-${id}`} className="scroll-mt-6" style={chartStyle(id)}>
                <div className="min-w-0">
                  <h2 className="group flex items-center gap-2 font-display text-lg font-semibold text-[#0b0b0b]">
                    {title}
                    <CopyChartLink anchor={`chart-${id}`} title={title} />
                  </h2>
                  {/* A div, not a p. Three of the blurbs are components that
                      render their own paragraph, and a p inside a p is invalid
                      HTML that the browser silently reparents, which breaks
                      hydration. The class list is margin and text utilities, so
                      nothing about the typography depends on the tag. */}
                  <div className={blurbClass}>
                    {heartLens && heartBlurb ? heartBlurb : blurb}
                  </div>
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
