import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenreKey } from "@/lib/palette";
import { ExplorerProvider, useExplorer } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import type { Dataset } from "@/lib/types";
import { CountryBars } from "@/components/CountryBars";
import { KeywordBars } from "@/components/KeywordBars";
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
 */
function AllBarCharts() {
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
    </>
  );
}

function mount() {
  return render(
    <ThemeProvider>
      <ExplorerProvider data={data}>
        <AllBarCharts />
      </ExplorerProvider>
    </ThemeProvider>,
  );
}

/** Let every tween that a change started run to completion. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
}

describe("bar chart tweens", () => {
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
});
