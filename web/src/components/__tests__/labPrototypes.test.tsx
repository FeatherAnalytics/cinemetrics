import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { TravelComparison } from "@/components/lab/TravelComparison";
import { TravelCallout } from "@/components/lab/TravelCallout";
import { computeTravelStats } from "@/lib/travelStats";
import type { Dataset } from "@/lib/types";

const stats = computeTravelStats(dataset as unknown as Dataset);

type Panel = (props: { stats: typeof stats }) => React.JSX.Element;

/**
 * The two travel panels left on the page.
 *
 * There were three. The small multiple was cut: ten columns of one to four films
 * is too little data for a chart with axes, and the callout already said the same
 * thing in prose. The comparison survived the cut because it is the only one that
 * can answer whether 2.10 films a day is a lot, which the callout can assert and
 * cannot show. Both of those are still whole-panel claims, so the agreement
 * assertions below are what stops the surviving pair from drifting apart.
 */
const PANELS: [string, Panel][] = [
  ["comparison", TravelComparison],
  ["callout", TravelCallout],
];

/** The visible text of a rendered panel, with runs of whitespace collapsed. */
function textOf(P: Panel): string {
  const { container } = render(<P stats={stats} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * The whole point of putting the travel prototypes behind one stats module: they
 * are PRESENTATIONS of one finding, so the review is a choice of drawing and not
 * a choice between different claims.
 *
 * These assert on rendered text rather than on the module, because the failure
 * being guarded against is a panel formatting a figure its own way. The stats
 * tests prove the numbers; nothing but this proves both panels print them.
 */
describe("the travel prototypes agree with each other", () => {
  beforeEach(() => {
    // jsdom has no layout, so the comparison panel's width observer needs a
    // stand-in. Same shim as barTweens.test.tsx.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("prints the same films-per-day pair in every panel", () => {
    const travel = stats.travel.filmsPerDay.toFixed(2);
    const ordinary = stats.ordinary.filmsPerDay.toFixed(2);
    expect([travel, ordinary]).toEqual(["2.10", "1.12"]);
    for (const [name, P] of PANELS) {
      const text = textOf(P);
      expect(text, `${name} travel films per day`).toContain(travel);
      expect(text, `${name} ordinary films per day`).toContain(ordinary);
      // The rounding trap, and the reason this test exists. "2.1 against 1.1" is
      // the same claim rounded until the 1.9x stops being visible in the two
      // numbers the reader is actually given.
      expect(text, `${name} must not round films per day to one decimal`).not.toMatch(
        /(^|[^\d.])2\.1([^\d]|$)/,
      );
    }
  });

  it("prints the ratio the same way in every panel", () => {
    for (const [name, P] of PANELS) {
      expect(textOf(P), `${name} ratio`).toContain("1.9x");
    }
  });

  /**
   * The one claim neither of these may make. A panel that shows a rating and
   * leaves the reader to infer a difference would be stating something the data
   * does not hold, so each has to say the gap is noise IN WORDS and not only in
   * marks.
   */
  it("says out loud that the rating does not move", () => {
    expect(stats.ratingGapIsNoise).toBe(true);
    for (const [name, P] of PANELS) {
      const text = textOf(P);
      expect(
        /does not move|Unchanged|not change/.test(text),
        `${name} must state the null result rather than imply a difference`,
      ).toBe(true);
      // The identical medians are the plainest evidence, so every panel carries
      // them even when it does not carry the means.
      expect(text, `${name} medians`).toMatch(/median/i);
    }
  });

  it("quotes both means wherever it quotes one", () => {
    // A panel showing only the travel mean would invite the reader to supply the
    // baseline from nowhere. Both survivors quote a mean, so this now covers the
    // same set as the tests above rather than a subset of it.
    for (const [name, P] of PANELS) {
      const text = textOf(P);
      expect(text, `${name} travel mean`).toContain(stats.travel.meanRating.toFixed(1));
      expect(text, `${name} ordinary mean`).toContain(stats.ordinary.meanRating.toFixed(1));
    }
  });

  it("never spends the accent on travel chrome", () => {
    // Crimson is genre identity, the diverging ramp and the heart. The dart is ink
    // for exactly this reason, per the note in lib/travel.
    for (const [name, P] of PANELS) {
      const { container } = render(<P stats={stats} />);
      expect(container.innerHTML, `${name}`).not.toMatch(/#c01023|#ff4757/i);
    }
  });

  it("draws one dart per flight day in the panel that shows days", () => {
    // The callout is the only survivor that shows individual days. The comparison
    // shows none, so it draws no darts, and that difference is the reason both
    // are still here.
    const darts = (P: Panel) =>
      render(<P stats={stats} />).container.querySelectorAll("svg path").length;
    expect(darts(TravelCallout)).toBe(stats.travel.days);
    expect(darts(TravelComparison)).toBe(0);
  });

  it("names every travel film in the callout, which is the only panel that can", () => {
    const text = textOf(TravelCallout);
    for (const day of stats.days) {
      for (const film of day.films) expect(text, film.title).toContain(film.title);
    }
    // And the comparison cannot, which is the real difference between the two.
    expect(textOf(TravelComparison)).not.toContain("Cocaine Bear");
  });
});
