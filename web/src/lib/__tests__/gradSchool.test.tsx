import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { GradSchoolEra } from "@/components/lab/GradSchoolEra";
import { ThemeProvider } from "@/lib/theme";
import {
  computeEraStats,
  GRAD_SCHOOL,
  monthIndex,
  rollingSeries,
  TREND_MONTHS,
} from "../gradSchool";
import type { Dataset } from "../types";

/**
 * The shipped payload, not a fixture.
 *
 * Every number below is a claim about my actual viewing, and the section's whole
 * argument is that an earlier figure had a confound behind it. A fixture would
 * let both the figure and the confound be whatever the fixture said.
 */
const data = dataset as unknown as Dataset;
const stats = computeEraStats(data);
const rows = data.watches
  .map((w) => ({ date: w.date, rating: w.rating }))
  .sort((a, b) => a.date.localeCompare(b.date));

describe("the span and the log it sits in", () => {
  it("takes the span the owner gave, inclusive at both ends", () => {
    expect([GRAD_SCHOOL.start, GRAD_SCHOOL.end]).toEqual(["2023-08-01", "2025-05-31"]);
    expect(stats.eraMonths).toBe(22);
    expect(stats.span.days).toBe(670);
    expect(stats.span.watches).toBe(169);
  });

  it("cuts the log into four stretches in date order that never overlap", () => {
    expect(stats.neighbors.map((w) => w.label)).toEqual([
      "the early years",
      "12 months before",
      "in school",
      "12 months after",
    ]);
    for (let i = 1; i < stats.neighbors.length; i++) {
      expect(stats.neighbors[i].start > stats.neighbors[i - 1].end, `gap ${i}`).toBe(true);
    }
    // The two flanking windows are 365 days each, on purpose, so the comparison
    // either side of the span is symmetric.
    expect(stats.neighbors[1].days).toBe(365);
    expect(stats.neighbors[3].days).toBe(365);
  });

  it("leaves only the tail past the last window uncovered, and counts it anyway", () => {
    // The four stretches deliberately do NOT cover the log: holding the flanking
    // windows to a year each leaves whatever the log has gained since. That tail
    // still belongs to "outside the span", and `outsideWatches` is what the copy
    // quotes rather than the sum of the table, which would undercount it.
    const covered = stats.neighbors.reduce((a, w) => a + w.watches, 0);
    const tail = data.watches.filter((w) => w.date > stats.neighbors[3].end);
    expect(covered + tail.length).toBe(data.watches.length);
    expect(stats.outsideWatches).toBe(data.watches.length - stats.span.watches);
    expect(stats.outsideWatches).toBeGreaterThan(covered - stats.span.watches);
  });

  it("holds the four stretches to their measured figures", () => {
    const seen = stats.neighbors.map((w) => [
      w.watches,
      Number(w.per30.toFixed(2)),
      Number(w.meanRating.toFixed(1)),
    ]);
    expect(seen).toEqual([
      [480, 11.12, 71.0],
      [85, 6.99, 76.6],
      [169, 7.57, 77.4],
      [53, 4.36, 76.8],
    ]);
  });
});

/**
 * The window width, which is the one number here that a well-meaning edit would
 * change and that would silently take the finding with it.
 */
describe("the rolling window", () => {
  it("keeps the window narrower than the era it has to resolve", () => {
    // At 24 this fails, which is the point. A window wider than the span cannot
    // produce a dip inside it, so flatness there would be an artifact of the
    // method rather than a fact about the viewing.
    expect(TREND_MONTHS).toBeLessThan(stats.eraMonths);
    // And narrow enough to cover the span about twice, not merely to fit in it.
    expect(stats.eraMonths / TREND_MONTHS).toBeGreaterThanOrEqual(1.5);
  });

  it("resolves a range that a 24-month window flattens away", () => {
    // The concrete cost of widening, asserted rather than argued.
    const twelve = rollingSeries(rows, 12);
    const twentyFour = rollingSeries(rows, 24);
    const spread = (s: typeof twelve, f: (p: (typeof twelve)[number]) => number) =>
      Math.max(...s.map(f)) - Math.min(...s.map(f));

    expect(twelve).toHaveLength(80);
    expect(twentyFour).toHaveLength(68);
    expect(spread(twelve, (p) => p.filmsPerMonth)).toBeGreaterThan(
      spread(twentyFour, (p) => p.filmsPerMonth),
    );
    expect(spread(twelve, (p) => p.meanRating ?? 0)).toBeGreaterThan(
      spread(twentyFour, (p) => p.meanRating ?? 0),
    );
  });

  it("gives the span its own points rather than only overlapping ones", () => {
    const inside = stats.series.filter(
      (p) => p.month >= monthIndex(GRAD_SCHOOL.start) && p.month <= monthIndex(GRAD_SCHOOL.end),
    );
    expect(inside).toHaveLength(stats.eraMonths);
    // From the window's width onward a point covers only months inside the span.
    const wholly = inside.filter(
      (p) => p.month - TREND_MONTHS + 1 >= monthIndex(GRAD_SCHOOL.start),
    );
    expect(wholly.length).toBeGreaterThan(0);
  });

  it("divides by the window width, so an empty month is a zero and not a gap", () => {
    const s = rollingSeries(
      [
        { date: "2020-01-05", rating: 80 },
        { date: "2020-03-05", rating: 60 },
      ],
      3,
    );
    expect(s[0].filmsPerMonth).toBeCloseTo(2 / 3, 6);
    expect(s[0].meanRating).toBe(70);
  });
});

/**
 * The claims the copy makes about the lines, held to the series rather than to
 * the prose. If either line ever does step at an edge, the sentences saying it
 * does not have to fail.
 */
describe("what the lines do at the edges of the span", () => {
  it("enters and leaves the span at the same rating", () => {
    expect(Math.abs(stats.opens.meanRating - stats.closes.meanRating)).toBeLessThan(1);
  });

  it("has the rating climb finish before the span opens", () => {
    const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
    expect(trough.year).toBeLessThan(Number(GRAD_SCHOOL.start.slice(0, 4)));
    // Most of the distance from the trough to the best year is already banked at
    // the moment the shading starts.
    const peak = Math.max(...stats.yearlyMeans.map((m) => m.mean));
    expect((stats.opens.meanRating - trough.mean) / (peak - trough.mean)).toBeGreaterThan(0.7);
  });

  it("finds the volume line moving inside the span, so the copy may not call it flat", () => {
    // The honest half. The rating line is flat across the span; the volume line
    // is not, and a section describing both as flat would be wrong about one.
    const swing =
      stats.spanVolumeRange.high.filmsPerMonth - stats.spanVolumeRange.low.filmsPerMonth;
    expect(swing).toBeGreaterThan(1);
    expect(stats.spanVolumeRange.high.filmsPerMonth).toBeGreaterThan(stats.opens.filmsPerMonth);
  });
});

describe("the span against its neighbors rather than against everything else", () => {
  it("finds both measures indistinguishable from the year before", () => {
    expect(stats.vsBefore.ratingIsNoise).toBe(true);
    expect(stats.vsBefore.volumeIsNoise).toBe(true);
    expect(Math.abs(stats.vsBefore.ratingDiff)).toBeLessThan(1.5);
    expect(Math.abs(stats.vsBefore.ratingZ)).toBeLessThan(1.96);
    expect(Math.abs(stats.vsBefore.rateZ)).toBeLessThan(1.96);
  });

  it("finds the real drop after the span rather than inside it", () => {
    // The one difference here big enough to read, and it is not the era's.
    expect(stats.vsAfter.volumeIsNoise).toBe(false);
    expect(stats.vsAfter.rateRatio).toBeGreaterThan(1.5);
    expect(stats.vsAfter.ratingIsNoise).toBe(true);
  });

  it("locates the discarded 5.0 point gap in the early years", () => {
    // Why the span-against-everything split was dropped. Reconstructed here so
    // the reason survives as a fact and not only as a comment.
    const [early, before, span, after] = stats.neighbors;
    const outside = [early, before, after];
    const outsideN = outside.reduce((a, w) => a + w.watches, 0);
    const outsideMean = outside.reduce((a, w) => a + w.meanRating * w.watches, 0) / outsideN;
    expect(span.meanRating - outsideMean).toBeGreaterThan(4.5);
    // And the same span against its own neighbor moves by under a point and a half.
    expect(Math.abs(span.meanRating - before.meanRating)).toBeLessThan(1.5);
    expect(early.watches / outsideN).toBeGreaterThan(0.7);
  });
});

describe("what the section is required to print", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  const mount = () =>
    render(
      <ThemeProvider>
        <GradSchoolEra stats={stats} />
      </ThemeProvider>,
    );
  const textOf = () => (mount().container.textContent ?? "").replace(/\s+/g, " ");

  it("draws two lines on one shared band", () => {
    const { container } = mount();
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    // Same x and width on both bands is the property a reader leans on when
    // comparing the panels by eye, so it is asserted rather than trusted.
    const bands = [...container.querySelectorAll("rect")];
    expect(bands).toHaveLength(2);
    expect(bands[0].getAttribute("x")).toBe(bands[1].getAttribute("x"));
    expect(bands[0].getAttribute("width")).toBe(bands[1].getAttribute("width"));
    for (const svg of svgs) expect(svg.querySelectorAll("path")).toHaveLength(1);
  });

  it("prints every stretch of the neighbor table, both measures", () => {
    const text = textOf();
    for (const w of stats.neighbors) {
      expect(text, w.label).toContain(w.label);
      expect(text, `${w.label} watches`).toContain(String(w.watches));
      expect(text, `${w.label} rate`).toContain(w.per30.toFixed(1));
      expect(text, `${w.label} mean`).toContain(w.meanRating.toFixed(1));
    }
  });

  it("states the window reasoning where the reader can see it", () => {
    const text = textOf();
    expect(text).toContain("Twelve months and not twenty-four");
    expect(text).toContain(`The span is ${stats.eraMonths} months`);
  });

  /**
   * The wording rules, which are the half the owner and the lead both cared
   * about. The section may not overclaim, and it may not misuse "significant".
   */
  it("refuses the causal reading without claiming to have disproved it", () => {
    const text = textOf();
    expect(text).toContain("The trend walks straight through it");
    expect(text).toContain("A chart cannot establish an absence");
    expect(text).toContain("Make of it what you like");
    // The banned construction, in either half. "Not significant" is not a
    // finding, and a chart cannot establish absence, so it misuses the word twice.
    expect(text).not.toMatch(/not significant/i);
    expect(text).not.toMatch(/itself significant/i);
    expect(text).not.toMatch(/statistically significant/i);
  });

  it("quotes the discarded figure only as something it stopped saying", () => {
    const text = textOf();
    expect(text).toContain("An earlier draft of this section reported");
    expect(text).toContain("5.0 points above everything outside it");
  });

  it("says out loud that the volume line is not flat", () => {
    // Guards against the section growing a tidy symmetrical "both lines are flat"
    // sentence, which would be wrong about one of them.
    expect(textOf()).toContain("not flat inside the span");
  });

  it("never spends the accent on era chrome", () => {
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/#c01023|#ff4757/i);
  });
});
