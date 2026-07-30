import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { TravelSmallMultiple } from "@/components/lab/TravelSmallMultiple";
import { TravelComparison } from "@/components/lab/TravelComparison";
import { TravelCallout } from "@/components/lab/TravelCallout";
import { computeTravelStats } from "@/lib/travelStats";
import type { Dataset } from "@/lib/types";

const stats = computeTravelStats(dataset as unknown as Dataset);

type Panel = (props: { stats: typeof stats }) => React.JSX.Element;

const PANELS: [string, Panel][] = [
  ["small multiple", TravelSmallMultiple],
  ["comparison", TravelComparison],
  ["callout", TravelCallout],
];

/** The panels that quote a mean rating. The small multiple quotes the gap instead. */
const MEAN_PANELS: [string, Panel][] = [
  ["comparison", TravelComparison],
  ["callout", TravelCallout],
];

/** The visible text of a rendered panel, with runs of whitespace collapsed. */
function textOf(P: Panel): string {
  const { container } = render(<P stats={stats} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * The whole point of putting the three prototypes behind one stats module: they
 * are three PRESENTATIONS of one finding, so the review is a choice of drawing
 * and not a choice between three different claims.
 *
 * These assert on rendered text rather than on the module, because the failure
 * being guarded against is a panel formatting a figure its own way. The stats
 * tests prove the numbers; nothing but this proves all three print them.
 */
describe("the three travel prototypes agree with each other", () => {
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
   * The one claim none of these may make. A panel that shows a rating and leaves
   * the reader to infer a difference would be stating something the data does not
   * hold, so each has to say the gap is noise IN WORDS and not only in marks.
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
    // baseline from nowhere.
    for (const [name, P] of MEAN_PANELS) {
      const text = textOf(P);
      expect(text, `${name} travel mean`).toContain(stats.travel.meanRating.toFixed(1));
      expect(text, `${name} ordinary mean`).toContain(stats.ordinary.meanRating.toFixed(1));
    }
    // The small multiple quotes the GAP and the medians instead of the two means,
    // because its cells already carry every individual rating.
    expect(textOf(TravelSmallMultiple)).toContain("1.6");
  });

  it("never spends the accent on travel chrome", () => {
    // Crimson is genre identity, the diverging ramp and the heart. The dart is ink
    // for exactly this reason, per the note in lib/travel.
    for (const [name, P] of PANELS) {
      const { container } = render(<P stats={stats} />);
      expect(container.innerHTML, `${name}`).not.toMatch(/#c01023|#ff4757/i);
    }
  });

  it("draws one dart per flight day in the panels that show days", () => {
    // 10 days in the small multiple plus its 3-mark leg legend, 10 again in the
    // callout. The comparison shows no days, so it draws no darts.
    const darts = (P: Panel) =>
      render(<P stats={stats} />).container.querySelectorAll("svg path").length;
    expect(darts(TravelSmallMultiple)).toBe(stats.travel.days + 3);
    expect(darts(TravelCallout)).toBe(stats.travel.days);
    expect(darts(TravelComparison)).toBe(0);
  });

  it("names every travel film in the callout, which is the only panel that can", () => {
    const text = textOf(TravelCallout);
    for (const day of stats.days) {
      for (const film of day.films) expect(text, film.title).toContain(film.title);
    }
    // And the small multiple cannot, which is the real difference between the two
    // and the answer to whether they collapsed into the same prototype.
    expect(textOf(TravelSmallMultiple)).not.toContain("Cocaine Bear");
  });
});
