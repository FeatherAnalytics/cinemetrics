"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { eyebrow, summaryLine } from "@/lib/summary";
import { hairline, useTheme } from "@/lib/theme";
import { RecommendProvider, useRecommend } from "@/lib/recommendStore";
import { RecommendDrawer } from "@/components/RecommendDrawer";
import { FilterBar } from "@/components/FilterBar";
import { SwimLaneChart, SwimLaneHeartBlurb } from "@/components/SwimLaneChart";
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
import { PosterBarcode, PosterBarcodeBlurb } from "@/components/PosterBarcode";
import { FavPosters } from "@/components/heart/FavPosters";
import { LikedByRating, LikedByRatingBlurb } from "@/components/heart/LikedByRating";
import { WhatMovesTheHeart } from "@/components/heart/WhatMovesTheHeart";
import {
  FavsAmongTheBest,
  FavsAmongTheBestBlurb,
} from "@/components/heart/FavsAmongTheBest";
import { FavDirectors, FavDirectorsBlurb } from "@/components/heart/FavDirectors";
import { SelectionPanel } from "@/components/SelectionPanel";
import { StatBar } from "@/components/StatBar";
import { StoryAnnotation } from "@/components/StoryAnnotation";
import { StoryChartNote } from "@/components/StoryChartNote";
import { WatchlistBarcode } from "@/components/watchlist/WatchlistBarcode";
import { WatchlistScores } from "@/components/watchlist/WatchlistScores";
import { WatchlistGenres } from "@/components/watchlist/WatchlistGenres";
import { WatchlistKeywords } from "@/components/watchlist/WatchlistKeywords";
import { WatchlistOrigin } from "@/components/watchlist/WatchlistOrigin";
import { StoryChips } from "@/components/StoryChips";
import { ThemeToggle } from "@/components/ThemeToggle";
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
export const CHART_SECTIONS: ChartSection[] = [
  // --- Shown at the top of EVERY set. ---
  // Opens every set. The rating histogram used to be first, which is the least
  // surprising chart in film data: every log is left-skewed. This one shows the
  // whole run at a glance before the reader has read a word.
  {
    id: "posterbarcode",
    sets: ["landing", "narrative", "heart"],
    // No year count in the title. The run is seven and a half years long, not
    // eight, and the barcode redraws to whatever the rail leaves standing, so any
    // span in the copy is a number the chart under it can contradict.
    title: "Every watch, in order",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <PosterBarcodeBlurb />,
    Chart: PosterBarcode,
  },
  // The shape of the scale every other chart is expressed in, so it comes before
  // the reader is asked to care when, where or against whom I watched.
  {
    id: "ratings",
    sets: ["landing", "narrative", "heart"],
    title: "How I rate",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <>Every rated watch, one column per half star.</>,
    Chart: RatingDistribution,
  },
  // --- The heart set. Only the favorites story shows these. ---
  {
    id: "favposters",
    title: "The four favorites",
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <LikedByRatingBlurb />,
    Chart: LikedByRating,
    sets: ["heart"],
  },
  {
    id: "heartpredictors",
    title: "Nothing decides the ones in between",
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <FavsAmongTheBestBlurb />,
    Chart: FavsAmongTheBest,
    sets: ["heart"],
  },
  {
    id: "favdirectors",
    title: "A favorite brings company",
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 text-xs",
    blurb: (
      <>
        One row per year, January to December. Height is my rating.
      </>
    ),
    heartBlurb: <SwimLaneHeartBlurb />,
    Chart: SwimLaneChart,
  },
  {
    id: "ytd",
    sets: ["landing"],
    title: "Viewings to date",
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <>Every bucket since the first logged watch. No smoothing.</>,
    Chart: ViewingVelocity,
  },
  {
    id: "monthly",
    sets: ["landing"],
    title: "Pace by month",
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <>Tukey box plots, one value per film, each film in exactly one genre.</>,
    Chart: RatingsByGenre,
  },
  {
    id: "rewatched",
    sets: ["landing"],
    title: "What I go back to",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: <MostRewatchedBlurb />,
    Chart: MostRewatched,
  },
  {
    id: "rewatch",
    sets: ["landing", "narrative", "heart"],
    title: "Second thoughts",
    blurbClass: "mb-4 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-3 max-w-2xl text-xs",
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
    blurbClass: "mb-2 text-xs",
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
    blurbClass: "mb-2 max-w-2xl text-xs",
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
    blurbClass: "mb-3 max-w-2xl text-xs",
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
    blurbClass: "mb-4 max-w-2xl text-xs",
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
    id: "wlbarcode",
    sets: ["watchlist"],
    title: "Release year and genre",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: (
      <>
        One brick per film, colored by genre.
      </>
    ),
    Chart: WatchlistBarcode,
  },
  {
    id: "wlscores",
    sets: ["watchlist"],
    title: "Watchlist ratings",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: (
      <>
        TMDB&rsquo;s audience score for each film on the watchlist.
      </>
    ),
    Chart: WatchlistScores,
  },
  {
    id: "wlgenres",
    sets: ["watchlist"],
    title: "Watchlist by genre",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: (
      <>
        How many watchlist films carry each genre.
      </>
    ),
    Chart: WatchlistGenres,
  },
  {
    id: "wlorigin",
    sets: ["watchlist"],
    title: "Origins of the watchlist",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: (
      <>
        Production country or original language.
      </>
    ),
    Chart: WatchlistOrigin,
  },
  {
    id: "wlkeywords",
    sets: ["watchlist"],
    title: "Watchlist keywords",
    blurbClass: "mb-2 max-w-2xl text-xs",
    blurb: (
      <>
        Keywords shared by three or more films on the list.
      </>
    ),
    Chart: WatchlistKeywords,
  },
];

function Explorer() {
  const { storyFocus, activeStory, films, yearBounds, heartLens } = useExplorer();
  const { state: recState } = useRecommend();
  const { tokens } = useTheme();
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
        <p
          className="font-mono text-xs uppercase tracking-[0.2em]"
          style={{ color: tokens.ink.muted }}
        >
          {eyebrow(startYear, endYear)}
        </p>
        {/* The toggle rides the h1's own row, opposite the title, because it is
            page chrome and the chips below are content controls. The row still
            has to survive 390px, which is why it pairs the toggle with the h1
            rather than pinning it to the header's corner: the h1 is one short
            line at every width, so the two share a line and neither can land on
            top of the chip list when the chips wrap to two rows. */}
        <div className="flex items-center justify-between gap-4">
          <h1
            className="font-display text-4xl font-bold tracking-tight"
            style={{ color: tokens.ink.primary }}
          >
            cinemetrics
            {/* The period is the way in to /lab. Nothing marks it, by design:
                the cursor is the only tell, so a reader who runs the pointer
                across the title finds it and a reader who does not is never
                told there was anything to miss.

                next/link and not a bare anchor. The site deploys under a
                basePath of /cinemetrics, which Link prepends and a raw href
                does not, so an anchor here would 404 in production and work
                perfectly in dev.

                Labelled for screen readers even though it is hidden from
                sighted ones. An easter egg may be unadvertised; it may not be
                a link that announces itself as "period". */}
            <Link
              href="/lab"
              aria-label="The cutting room: charts that did not make the page"
              style={{ color: tokens.accent }}
            >
              .
            </Link>
          </h1>
          <ThemeToggle />
        </div>
        {/* Same sentence the share preview uses, from lib/summary. No instruction
            and no watch total: the stat bar prints that a few inches below, and
            telling a reader to tap a chip spends a line on something the chip's
            own arrow already says. */}
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
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
        style={{ background: tokens.ui.active, color: tokens.ui.activeText }}
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
              className="lg:sticky lg:top-6 flex h-10 w-10 items-center justify-center rounded-lg border transition hover:text-[color:var(--foreground)]"
              style={{
                borderColor: hairline(tokens.ink.primary, 14),
                background: tokens.surface.paper,
                color: tokens.ink.secondary,
              }}
              aria-label="Expand filters"
              aria-expanded={false}
            >
              <span aria-hidden>☰</span>
            </button>
          </div>
        )}

        {/* One panel, two lives: a sticky sidebar at lg, a slide-in drawer below it. */}
        <aside
          /* rail-column rather than a desktop width class of its own: /lab draws
             the same column beside the same content, and the two pages only line
             up if one rule sets the width for both. See --rail-width in
             globals.css. */
          className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm transform overflow-y-auto p-4 shadow-xl transition-transform duration-300 lg:static lg:z-auto lg:mb-0 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:overflow-visible lg:p-0 lg:shadow-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          } ${collapsed ? "lg:hidden" : "rail-column"} bg-[var(--surface-paper)] lg:bg-transparent`}
          /* Opaque only as a drawer. At lg the aside is a flex child that
             stretches to the height of the chart column beside it, so a
             background here painted a tall block below the panel's own card.
             The inner card supplies the desktop surface; this only has to hide
             the page behind the mobile drawer.

             Set through a class rather than `style`, because an inline
             background would win over the lg: reset. */
          aria-label="Filters"
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen || undefined}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <span
              className="font-mono text-xs uppercase tracking-[0.15em]"
              style={{ color: tokens.ink.muted }}
            >
              Filters
            </span>
            <button
              ref={drawerCloseRef}
              onClick={() => setDrawerOpen(false)}
              className="rounded-full px-2 py-1 text-lg leading-none transition hover:text-[color:var(--foreground)]"
              style={{ color: tokens.ink.secondary }}
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>
          <div
            className="rounded-lg border p-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
            style={{ borderColor: hairline(tokens.ink.primary, 14) }}
          >
            <div className="mb-2 hidden justify-end lg:flex">
              <button
                onClick={() => setCollapsed(true)}
                className="font-mono text-[10px] uppercase tracking-[0.1em] transition hover:text-[color:var(--foreground)]"
                style={{ color: tokens.ink.muted }}
              >
                <span aria-hidden>« </span>hide
              </button>
            </div>
            <StatBar />
            <div
              className="my-3 border-t"
              style={{ borderColor: hairline(tokens.ink.primary, 10) }}
            />
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
                  <h2
                    className="group flex items-center gap-2 font-display text-lg font-semibold"
                    style={{ color: tokens.ink.primary }}
                  >
                    {title}
                    <CopyChartLink anchor={`chart-${id}`} title={title} />
                  </h2>
                  {/* A div, not a p. Three of the blurbs are components that
                      render their own paragraph, and a p inside a p is invalid
                      HTML that the browser silently reparents, which breaks
                      hydration. The class list is margin and text utilities, so
                      nothing about the typography depends on the tag. */}
                  <div className={blurbClass} style={{ color: tokens.ink.muted }}>
                    {heartLens && heartBlurb ? heartBlurb : blurb}
                  </div>
                  {/* Story prose sits between the blurb and the chart: the
                      headline bar on the story's primary chart, a matching
                      note block on secondary charts. Charts keep full width. */}
                  <StoryAnnotation target={id} />
                  <StoryChartNote target={id} />
                  <div
                    className="rounded-md border p-4"
                    style={{
                      // Still the CSS-variable surface, not a JS token: this is
                      // page chrome (card ground), not a chart mark, and stays
                      // in step with `--surface-card` by design (see globals.css).
                      background: "var(--surface-card)",
                      borderColor: hairline(tokens.ink.primary, 9),
                    }}
                  >
                    <Chart />
                  </div>
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
