import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenreKey } from "@/lib/palette";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import type { Dataset } from "@/lib/types";
import { CountryBars } from "@/components/CountryBars";
import { FranchiseRuns } from "@/components/FranchiseRuns";
import { KeywordBars } from "@/components/KeywordBars";
import { RewatchCadence } from "@/components/RewatchCadence";
import { RollingRating } from "@/components/RollingRating";
import { MonthlyPace } from "@/components/stats/MonthlyPace";
import { RatingDistribution } from "@/components/stats/RatingDistribution";
import { ViewingVelocity } from "@/components/stats/ViewingVelocity";
import { WeekdayCounts } from "@/components/stats/WeekdayCounts";
import { WatchlistGenres } from "@/components/watchlist/WatchlistGenres";
import { WatchlistKeywords } from "@/components/watchlist/WatchlistKeywords";
import { WatchlistOrigin } from "@/components/watchlist/WatchlistOrigin";
import { WatchlistScores } from "@/components/watchlist/WatchlistScores";

/**
 * The published dataset, not a fixture.
 *
 * The bug this file guards against lives in the dependency chain between the
 * store and each chart's `useMemo`, so a hand-built two-row dataset would
 * exercise the wrong thing: the chains that matter are the ones the real
 * filters, the real deferred value and the real top-N cutoffs drive.
 */
const data = JSON.parse(readFileSync("public/data/cinemetrics.json", "utf8")) as Dataset;

/**
 * The rail controls, reached from outside the tree.
 *
 * Populated in an effect rather than during render: assigning to an
 * outer-scope binding while rendering is a side effect, and the lint rule that
 * forbids it is right even in a test.
 */
const rail: {
  toggleGenre?: (g: GenreKey) => void;
  setSelected?: (id: number | null) => void;
} = {};

/**
 * Every chart converted to `useAnimatedValues` in one tree.
 *
 * `CategoryBars` and `RankedBars` are here through their callers rather than
 * directly, because the identity requirement they impose is on the CALLER and
 * mounting them with a literal prop would test nothing.
 *
 * The last three are the line and dot charts. `RollingRating` tweens per panel
 * and the other two per row, so each of them holds many independent instances
 * of the hook and each one has its own chance to get the identity chain wrong.
 */
function AllTweenedCharts() {
  const explorer = useExplorer();
  useEffect(() => {
    rail.toggleGenre = explorer.toggleGenre;
    rail.setSelected = explorer.setSelected;
  });
  return (
    <>
      <RatingDistribution />
      <MonthlyPace />
      <WeekdayCounts />
      <ViewingVelocity />
      <KeywordBars />
      <CountryBars />
      <WatchlistGenres />
      <WatchlistKeywords />
      <WatchlistOrigin />
      <WatchlistScores />
      <RollingRating />
      <RewatchCadence />
      <FranchiseRuns />
    </>
  );
}

function mount() {
  return render(
    <ThemeProvider>
      <ExplorerProvider data={data}>
        <AllTweenedCharts />
      </ExplorerProvider>
    </ThemeProvider>,
  );
}

/**
 * Every dot's `cy` in each labelled row of a row-per-subject chart, keyed by
 * the row's label so a row can be tracked across a filter change.
 */
function rowYs(svg: Element): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of svg.querySelectorAll("g")) {
    const label = g.querySelector("text")?.textContent;
    const dots = [...g.querySelectorAll("circle")];
    if (label && dots.length) out.set(label, dots.map((c) => c.getAttribute("cy") ?? ""));
  }
  return out;
}

/** Let every tween that a change started run to completion. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
}

describe("filter-change tweens", () => {
  beforeEach(() => {
    // vitest hands back the EXISTING spy when a method is already mocked, so
    // without this the second test inherits the first one's call log and reads
    // a frame count that nothing in it ever requested.
    vi.restoreAllMocks();
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // jsdom has no layout, so the charts' width observer needs a stand-in.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.useFakeTimers();
  });

  it("stops asking for frames once a filter change has finished animating", async () => {
    mount();
    await settle();

    const raf = vi.spyOn(window, "requestAnimationFrame");
    await act(async () => {
      rail.toggleGenre!("Horror");
    });
    // The charts must actually be animating, or the rest of this proves only
    // that nothing happens.
    expect(raf.mock.calls.length).toBeGreaterThan(0);
    await settle();
    expect(raf.mock.calls.length).toBeGreaterThan(100);

    // A chart whose `useMemo` rebuilds its numbers array every render restarts
    // its tween on every frame it causes, so it never reaches this state: the
    // frame requests continue forever and the bars sit still while they do.
    raf.mockClear();
    await settle();
    expect(raf.mock.calls).toEqual([]);
  });

  it("does not animate on a re-render that changes no chart data", async () => {
    mount();
    await settle();
    await act(async () => {
      rail.toggleGenre!("Horror");
    });
    await settle();

    // Selecting a film re-renders every consumer of the store, and changes not
    // one number on any of these charts. Anything that tweens here is tweening
    // because its target array was rebuilt, not because a value moved.
    const raf = vi.spyOn(window, "requestAnimationFrame");
    await act(async () => {
      rail.setSelected!(data.films[0].tmdb_id);
    });
    await settle();
    expect(raf.mock.calls).toEqual([]);
  });

  it.each([
    ["Second thoughts", "Rewatched films grouped"],
    ["Franchise runs", "One row per franchise"],
  ])("eases a surviving row of %s rather than rebuilding it", async (_name, ariaPrefix) => {
    const { container } = mount();
    await settle();

    const svg = container.querySelector(`svg[aria-label^="${ariaPrefix}"]`);
    expect(svg).not.toBeNull();

    await act(async () => {
      rail.toggleGenre!("Horror");
    });
    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    const mid = rowYs(svg!);
    await settle();
    const settled = rowYs(svg!);

    // A row survives the filter with the same viewings it always had, and moves
    // only because the rows above it left and the shared rating scale refit. If
    // its React subtree is rebuilt on the change instead of updated — which is
    // what happens when a parent's key carries a count that the filter alters —
    // the row is constructed already at its destination and never moves at all.
    const moved = [...settled].filter(([label, ys]) => {
      const m = mid.get(label);
      return m != null && m.length === ys.length && m.some((y, i) => y !== ys[i]);
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});
