import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SwimLaneChart, SwimLaneHeartBlurb } from "@/components/SwimLaneChart";
import { FAV_IDS } from "@/lib/fourFavs";
import { SOLSTICE_WATCH } from "@/lib/solstice";
import { ExplorerProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { planePath, TRAVEL_DAYS } from "@/lib/travel";
import { starPath } from "@/lib/favMarker";
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

/** Segments in a closed path, which is how the two marks are told apart below. */
const segments = (d: string) => d.match(/L/g)?.length ?? 0;

/**
 * The segment count each mark happens to draw, ASKED OF THE FUNCTIONS rather than
 * written down.
 *
 * What this file tests is which mark wins, not what either one looks like. The
 * plane's outline is under active review behind `/lab` and has already changed
 * once, so a literal here would turn every future reshaping of it into a failure
 * in a test about precedence. Reading the counts from `planePath` and `starPath`
 * keeps the two distinguishable however either is drawn.
 */
const PLANE_SEGMENTS = segments(planePath(0, 0, 5));
const STAR_SEGMENTS = segments(starPath(0, 0, 5));

/**
 * Which mark a path is, read off its own geometry rather than a test hook.
 *
 * The solstice sun draws lines and a circle rather than a path, so it never lands
 * here at all.
 */
function markCounts(container: Element): { planes: number; stars: number } {
  // A shape that drew the same number of segments as the other would make every
  // count below meaningless, and it would do it silently.
  expect(PLANE_SEGMENTS, "the two marks must stay distinguishable").not.toBe(STAR_SEGMENTS);
  let planes = 0;
  let stars = 0;
  for (const p of container.querySelectorAll("svg path")) {
    const n = segments(p.getAttribute("d") ?? "");
    if (n === PLANE_SEGMENTS) planes += 1;
    if (n === STAR_SEGMENTS) stars += 1;
  }
  return { planes, stars };
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
  it("draws a star, not a plane, for a favorite watched on a travel day", () => {
    expect(favOnTravelDay).toHaveLength(1);
    expect(favOnTravelDay[0].date).toBe("2023-10-10");

    const { container } = mount();
    const { planes, stars } = markCounts(container);

    // Every favorite watch keeps its star, including the flown one.
    expect(stars).toBe(favWatches.length);
    // And that one watch is the difference in the plane count: the rest of its
    // day is still flown, so the flight does not go unmarked.
    expect(planes).toBe(travelWatches.length - favOnTravelDay.length);
  });

  /**
   * The heart caption counts the watches the LENS actually dims.
   *
   * The heart is one toggle per film, so the store recovers it to film level: a
   * sheet-era watch of a film hearted on a later viewing already carries one and
   * stays lit. Counting raw `liked` nulls instead would name every sheet-era row
   * and overstate the dim set by the films that were recovered, which is a third
   * of them.
   */
  it("counts the watches with no heart on record, not every sheet-era row", () => {
    const recovered = new Map<number, boolean>();
    for (const w of data.watches) {
      if (w.liked != null && !recovered.has(w.tmdb_id)) recovered.set(w.tmdb_id, w.liked);
    }
    const dim = data.watches.filter((w) => (w.liked ?? recovered.get(w.tmdb_id) ?? null) === null);
    const rawNulls = data.watches.filter((w) => w.liked == null);
    // The two differ, so this is a real distinction rather than a restatement.
    expect(dim.length).toBeLessThan(rawNulls.length);

    const years = dim.map((w) => Number(w.date.slice(0, 4)));
    const lo = Math.min(...years);
    const hi = Math.max(...years);

    const { container } = render(
      <ThemeProvider>
        <ExplorerProvider data={data}>
          <SwimLaneHeartBlurb />
        </ExplorerProvider>
      </ThemeProvider>,
    );
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(`${dim.length} watches there predate the heart entirely`);
    expect(text).toContain(lo === hi ? `${lo} with it` : `${lo} to ${hi} with it`);
    expect(text).not.toContain(`${rawNulls.length} watches`);
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
