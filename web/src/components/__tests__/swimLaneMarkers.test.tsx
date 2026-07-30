import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SwimLaneChart } from "@/components/SwimLaneChart";
import { FAV_IDS } from "@/lib/fourFavs";
import { SOLSTICE_WATCH } from "@/lib/solstice";
import { ExplorerProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { TRAVEL_DAYS } from "@/lib/travel";
import type { Dataset } from "@/lib/types";

/**
 * The published dataset, not a fixture.
 *
 * The whole question here is which of two marks a PARTICULAR watch gets, and
 * that watch exists only in the real log. A hand-built row holding a favorite on
 * a travel date would keep passing after the log stopped containing one, which
 * is the case the precedence rule was written for.
 */
const data = JSON.parse(readFileSync("public/data/cinemetrics.json", "utf8")) as Dataset;

/** Watches of a profile favorite, and of those the ones flown. */
const favWatches = data.watches.filter((w) => FAV_IDS.has(w.tmdb_id));
const favOnTravelDay = favWatches.filter((w) => TRAVEL_DAYS[w.date] != null);
const travelWatches = data.watches.filter((w) => TRAVEL_DAYS[w.date] != null);

/**
 * Which mark a path is, read off its own geometry rather than a test hook.
 *
 * `planePath` emits four points and `starPath` ten, so the line count separates
 * them with nothing added to the chart for the test's benefit. The solstice sun
 * draws lines and a circle and so never lands here at all.
 */
function markCounts(container: Element): { darts: number; stars: number } {
  let darts = 0;
  let stars = 0;
  for (const p of container.querySelectorAll("svg path")) {
    const lines = (p.getAttribute("d") ?? "").match(/L/g)?.length ?? 0;
    if (lines === 3) darts += 1;
    if (lines === 9) stars += 1;
  }
  return { darts, stars };
}

function mount() {
  return render(
    <ThemeProvider>
      <ExplorerProvider data={data}>
        <SwimLaneChart />
      </ExplorerProvider>
    </ThemeProvider>,
  );
}

describe("which mark wins when a watch qualifies for two", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  /**
   * The owner's decision, held to the data rather than to a comment.
   *
   * One watch in the log qualifies for both a star and a dart, and the reason
   * this is worth a test is that the rule is expressed as the ORDER of two `if`
   * blocks. Swapping them back is a two-line edit that breaks nothing else and
   * that no other assertion in the suite would notice.
   */
  it("draws a star, not a dart, for a favorite watched on a travel day", () => {
    expect(favOnTravelDay).toHaveLength(1);
    expect(favOnTravelDay[0].date).toBe("2023-10-10");

    const { container } = mount();
    const { darts, stars } = markCounts(container);

    // Every favorite watch keeps its star, including the flown one.
    expect(stars).toBe(favWatches.length);
    // And that one watch is the difference in the dart count: the rest of its
    // day is still flown, so the flight does not go unmarked.
    expect(darts).toBe(travelWatches.length - favOnTravelDay.length);
  });

  it("leaves the solstice sun ahead of both", () => {
    // The most specific of the three marks: one named watch, not a film and not
    // a day. It is neither a favorite nor flown today, so the ordering below is
    // the only thing keeping that true if either list ever grows to include it.
    expect(FAV_IDS.has(SOLSTICE_WATCH.tmdb_id)).toBe(false);
    expect(TRAVEL_DAYS[SOLSTICE_WATCH.date]).toBeUndefined();

    const { container } = mount();
    // The sun's eight rays are the only free-standing lines inside a dot layer.
    const rays = [...container.querySelectorAll("svg line")].filter(
      (l) => l.getAttribute("stroke-linecap") === "round",
    );
    expect(rays).toHaveLength(8);
  });
});
