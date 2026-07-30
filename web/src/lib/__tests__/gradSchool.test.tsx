import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { GradSchoolEra } from "@/components/lab/GradSchoolEra";
import { ThemeProvider } from "@/lib/theme";
import { computeEraStats, GRAD_SCHOOL } from "../gradSchool";
import type { Dataset } from "../types";

/**
 * The shipped payload, not a fixture.
 *
 * Every number below is a claim about my actual viewing, and the section's whole
 * argument is that one real figure has a confound behind it. A fixture would let
 * both the figure and the confound be whatever the fixture said.
 */
const stats = computeEraStats(dataset as unknown as Dataset);

describe("the grad school span against the shipped log", () => {
  it("splits the calendar the way the owner gave it", () => {
    expect([GRAD_SCHOOL.start, GRAD_SCHOOL.end]).toEqual(["2023-08-01", "2025-05-31"]);
    // Inclusive at both ends, which is the difference between 670 and 669.
    expect(stats.inSpan.days).toBe(670);
    expect(stats.outside.days).toBe(2080);
    expect(stats.inSpan.days + stats.outside.days).toBe(2750);
  });

  it("counts every watch on exactly one side", () => {
    expect(stats.inSpan.watches).toBe(169);
    expect(stats.outside.watches).toBe(626);
    expect(stats.inSpan.watches + stats.outside.watches).toBe(dataset.watches.length);
  });

  it("finds the pace lower in the span and the rating higher", () => {
    expect(stats.inSpan.per30.toFixed(1)).toBe("7.6");
    expect(stats.outside.per30.toFixed(1)).toBe("9.0");
    expect(stats.inSpan.meanRating.toFixed(1)).toBe("77.4");
    expect(stats.outside.meanRating.toFixed(1)).toBe("72.4");
  });

  it("puts the rating gap well outside noise, unlike the travel one", () => {
    // The reason this section may state a difference at all, and the reason it
    // cannot borrow the travel panels' "does not move" wording.
    expect(stats.ratingDiff).toBeGreaterThan(5);
    expect(stats.ratingGapIsNoise).toBe(false);
    expect(stats.ratingDiffZ).toBeGreaterThan(4);
  });
});

/**
 * The confound, asserted rather than described.
 *
 * The section is allowed to print a real +5 point gap only because it also
 * prints why that gap is not the era's doing. These hold the evidence for that
 * second half, so a later edit cannot quietly keep the flattering figure and
 * drop the reason it means less than it looks.
 */
describe("the confound behind the rating gap", () => {
  it("has the climb already under way before the span opens", () => {
    const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
    const spanStartYear = Number(GRAD_SCHOOL.start.slice(0, 4));
    const peak = Math.max(...stats.yearlyMeans.map((m) => m.mean));
    const atStart = stats.yearlyMeans.find((m) => m.year === spanStartYear)!;

    expect(trough.year).toBeLessThan(spanStartYear);
    // Most of the total rise from the trough to the best year is already banked
    // by the year the span opens in.
    const banked = (atStart.mean - trough.mean) / (peak - trough.mean);
    expect(banked).toBeGreaterThan(0.7);
  });

  it("finds the level flat against the span's own neighbors", () => {
    const [, before, inside, after] = stats.neighbors;
    expect(before.label).toBe("12 months before");
    expect(after.label).toBe("12 months after");
    // Both sides sit within a point of the span itself, against the 5 point gap
    // the whole-outside comparison reports.
    expect(Math.abs(inside.meanRating - before.meanRating)).toBeLessThan(1.5);
    expect(Math.abs(inside.meanRating - after.meanRating)).toBeLessThan(1.5);
    expect(stats.ratingDiff).toBeGreaterThan(
      Math.abs(inside.meanRating - before.meanRating) * 3,
    );
  });

  it("locates the gap in the early years rather than in the span", () => {
    const early = stats.neighbors[0];
    // Most of the outside side is a period that ended a year before school
    // started, and it is the low one.
    expect(early.watches / stats.outside.watches).toBeGreaterThan(0.7);
    expect(early.meanRating).toBeLessThan(stats.outside.meanRating);
    expect(stats.inSpan.meanRating - early.meanRating).toBeGreaterThan(stats.ratingDiff);
  });

  it("shows no step in the pace at the boundary", () => {
    const startMonth = GRAD_SCHOOL.start.slice(0, 7);
    const busiest = stats.boundaryMonths.reduce((a, b) => (b.watches > a.watches ? b : a));
    // The month before school is the busiest of the seven around the boundary,
    // so the count does not step up when the span opens. It steps down.
    expect(busiest.month < startMonth).toBe(true);
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

  const textOf = () => {
    const { container } = render(
      <ThemeProvider>
        <GradSchoolEra stats={stats} />
      </ThemeProvider>,
    );
    return (container.textContent ?? "").replace(/\s+/g, " ");
  };

  it("prints both sides of every figure it quotes", () => {
    const text = textOf();
    for (const n of [
      String(stats.inSpan.days),
      String(stats.outside.days),
      String(stats.inSpan.watches),
      String(stats.outside.watches),
      stats.inSpan.per30.toFixed(1),
      stats.outside.per30.toFixed(1),
      stats.inSpan.meanRating.toFixed(1),
      stats.outside.meanRating.toFixed(1),
    ]) {
      expect(text, n).toContain(n);
    }
  });

  /**
   * The caveat is the half the owner cared about, so it is the half held to a
   * test. A section that printed +5.0 and stopped would be inviting exactly the
   * causal reading the data does not support.
   */
  it("refuses the causal reading in words, not only in figures", () => {
    const text = textOf();
    expect(text).toContain("not evidence that school did it");
    expect(text).toContain("What this does not show is a cause");
    // And carries the numbers that make the refusal checkable rather than
    // asking the reader to take it on trust.
    const [early, before, inside, after] = stats.neighbors;
    for (const w of [early, before, inside, after]) {
      expect(text, w.label).toContain(w.meanRating.toFixed(1));
    }
    for (const m of stats.yearlyMeans) expect(text, String(m.year)).toContain(m.mean.toFixed(1));
  });

  it("never spends the accent on era chrome", () => {
    // Crimson is genre identity, the diverging ramp and the heart. A date range
    // is none of those.
    const { container } = render(
      <ThemeProvider>
        <GradSchoolEra stats={stats} />
      </ThemeProvider>,
    );
    expect(container.innerHTML).not.toMatch(/#c01023|#ff4757/i);
  });
});
