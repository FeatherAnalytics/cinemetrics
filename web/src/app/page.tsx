"use client";

import { useEffect, useState } from "react";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { FilterBar } from "@/components/FilterBar";
import { SwimLaneChart } from "@/components/SwimLaneChart";
import { ResidualScatter } from "@/components/ResidualScatter";
import { KeywordBars } from "@/components/KeywordBars";
import { WorldMap } from "@/components/WorldMap";
import { RewatchCadence } from "@/components/RewatchCadence";
import { RollingRating } from "@/components/RollingRating";
import { SelectionPanel } from "@/components/SelectionPanel";
import { StatBar } from "@/components/StatBar";
import { StoryAnnotation } from "@/components/StoryAnnotation";
import type { ChartId } from "@/lib/stories";

function Explorer() {
  const { loading, storyFocus } = useExplorer();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll while the mobile drawer is open, and close it if the
  // viewport grows to the desktop breakpoint (where the panel is a sidebar).
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [drawerOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const chartStyle = (id: ChartId): React.CSSProperties => {
    if (!storyFocus) return {};
    if (storyFocus.dim.includes(id)) return { opacity: 0.4, pointerEvents: "none", transition: "opacity 0.3s" };
    return {};
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#67655f]">
          a personal film log · 2019–2026
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#0b0b0b]">
          cinemetrics<span style={{ color: "#c01023" }}>.</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#3d3c38]">
          Every film I&rsquo;ve logged, cross-filtered — change any control and both charts
          move together. Click a film to trace it across them.
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
        {/* One panel, two lives: a sticky sidebar at lg, a slide-in drawer below it. */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm transform overflow-y-auto p-4 shadow-xl transition-transform duration-300 lg:static lg:z-auto lg:mb-0 lg:w-72 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:overflow-visible lg:p-0 lg:shadow-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "#f7f6f3" }}
          aria-label="Filters"
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#67655f]">Filters</span>
            <button
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
            <StatBar />
            <div className="my-3 border-t" style={{ borderColor: "rgba(11,11,11,0.1)" }} />
            <FilterBar />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="text-sm text-[#67655f]">Loading…</p>
          ) : (
            <div className="grid gap-8">
          <SelectionPanel />

          <section style={chartStyle("spiral")}>
            <StoryAnnotation target="spiral" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">When I watch</h2>
            <p className="mb-2 text-xs text-[#67655f]">
              One row per year, January to December. Higher dots = higher ratings.
            </p>
            <SwimLaneChart />
          </section>

          <section style={chartStyle("contrarian")}>
            <StoryAnnotation target="contrarian" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">Where I align and deviate</h2>
            <p className="mb-2 text-xs text-[#67655f]">
              Each dot is a film. The diagonal is perfect agreement between me and critics.
              Above = I rated higher than expected; below = lower.
            </p>
            <ResidualScatter />
          </section>

          <section style={chartStyle("keywords")}>
            <StoryAnnotation target="keywords" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">Where my taste deviates</h2>
            <p className="mb-3 max-w-2xl text-xs text-[#67655f]">
              After controlling for critic scores — keywords where I systematically rate
              higher or lower than predicted. Click a bar to see those films.
            </p>
            <KeywordBars />
          </section>

          <section style={chartStyle("map")}>
            <StoryAnnotation target="map" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">Where they come from</h2>
            <p className="mb-2 text-xs text-[#67655f]">
              Each country is shaded by its production count and coloured by the genre I watch most
              from there. Click a country to filter the other charts.
            </p>
            <WorldMap />
          </section>

          <section style={chartStyle("rolling")}>
            <StoryAnnotation target="rolling" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">How my taste settles</h2>
            <p className="mb-3 max-w-2xl text-xs text-[#67655f]">
              One panel per group: the coloured line is my rolling {`10`}-watch average rating as
              I work through that group, with my overall average behind it in grey for comparison.
              Switch how the films are grouped — genre, language, country, runtime, release decade,
              or content rating.
            </p>
            <RollingRating />
          </section>

          <section style={chartStyle("rewatch")}>
            <StoryAnnotation target="rewatch" />
            <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">Rewatches</h2>
            <p className="mb-4 max-w-2xl text-xs text-[#67655f]">
              Each row is a film I&rsquo;ve returned to; every dot is a watch, placed left-to-right
              by date and up-or-down by my rating.
            </p>
            <RewatchCadence />
          </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ExplorerProvider>
      <Explorer />
    </ExplorerProvider>
  );
}
