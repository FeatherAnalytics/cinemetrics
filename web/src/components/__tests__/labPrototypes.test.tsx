import { fireEvent, render } from "@testing-library/react";
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

  /**
   * The comparison's hover readout. The panel's own labels round: 2.10 sits at
   * the end of a bar and 74 at the end of a whisker, and nothing on the face of
   * it says how many days or how wide the interval is. That is what the tooltip
   * is for, so these assert the EXACT figures rather than that a box appeared.
   */
  describe("the comparison's hover readout", () => {
    const tips = (container: HTMLElement) =>
      [...container.querySelectorAll(".pointer-events-none")].map((el) =>
        (el.textContent ?? "").replace(/\s+/g, " "),
      );

    /** Panel 0 films per day, 1 the multi-film share, 2 the rating intervals. */
    const hoverRow = (panel: number, row: 0 | 1) => {
      const { container } = render(<TravelComparison stats={stats} />);
      const svg = container.querySelectorAll("svg")[panel];
      // ROW_H is 34, so the second row starts at 34. x is ignored by the hit
      // test, which reads the pointer's y and nothing else.
      fireEvent.mouseMove(svg, { clientX: 200, clientY: row === 0 ? 10 : 45 });
      return { container, text: tips(container)[0] ?? "" };
    };

    it("shows nothing until the pointer is over a panel", () => {
      const { container } = render(<TravelComparison stats={stats} />);
      expect(tips(container)).toHaveLength(0);
    });

    /**
     * The counts BEHIND the bar, and only those.
     *
     * This used to require the rate as a prefix too, "2.10 a day · 21 watches,
     * 10 days". The owner dropped it deliberately: the bar prints 2.10 at its
     * own end, so the prefix repeated a number already on screen an inch away.
     * What the face of the chart cannot show is what the rate is a rate OF, so
     * that is what the readout is now for.
     */
    it("gives the films-per-day row the counts its bar cannot show", () => {
      const { travel, ordinary } = stats;
      expect(hoverRow(0, 0).text).toBe(`Travel days${travel.watches} watches over ${travel.days} days`);
      expect(hoverRow(0, 1).text).toBe(
        `Ordinary days${ordinary.watches} watches over ${ordinary.days} days`,
      );
      // The prefix is only safe to drop while the bar still carries the figure,
      // so that stays asserted here rather than only in the panel-wide test.
      expect(textOf(TravelComparison)).toContain(travel.filmsPerDay.toFixed(2));
    });

    it("gives the multi-film row the days behind the percentage", () => {
      const { travel } = stats;
      expect(hoverRow(1, 0).text).toContain(
        `${travel.multiFilmDays} of ${travel.days} days`,
      );
      expect(hoverRow(1, 1).text).toContain(
        `${stats.ordinary.multiFilmDays} of ${stats.ordinary.days} days`,
      );
    });

    it("spells out the interval on the rating panel, which is its whole point", () => {
      const { travel } = stats;
      const half = 1.96 * travel.seRating;
      const text = hoverRow(2, 0).text;
      expect(text).toContain(travel.meanRating.toFixed(1));
      expect(text).toContain(`${(travel.meanRating - half).toFixed(1)} to`);
      expect(text).toContain((travel.meanRating + half).toFixed(1));
      expect(text).toContain(`median ${travel.medianRating}`);
    });

    /**
     * The relabelling, and the reader question that forced it: how can both
     * medians be 70 when the interval does not contain 70?
     *
     * Nothing was wrong with the arithmetic. "73.5 · 72.5 to 74.4 · median 70"
     * is three bare numbers side by side, which reads as one range with a
     * middle, and a range containing a middle it does not contain is a
     * contradiction. The interval belongs to the MEAN and to nothing else: the
     * ratings run 20 to 100, and on the ordinary side the mean sits above the
     * median because more watches sit above 70 than below it. So each statistic
     * is named where it is printed.
     */
    it("names the statistic each figure belongs to in the rating readout", () => {
      const { ordinary } = stats;
      const half = 1.96 * ordinary.seRating;
      const lo = ordinary.meanRating - half;
      const hi = ordinary.meanRating + half;
      // The case the labelling exists for. If the median ever moved inside the
      // interval this guard would still hold, but the bug it documents would
      // have gone, so the assertion records that today it does not.
      expect(ordinary.medianRating).toBeLessThan(lo);
      expect(hoverRow(2, 1).text).toBe(
        `Ordinary daysmean ${ordinary.meanRating.toFixed(1)} (95% CI ${lo.toFixed(
          1,
        )} to ${hi.toFixed(1)}) · median ${ordinary.medianRating}`,
      );
      // Bare, unlabelled figures are the failure mode, so the shape that caused
      // it may not come back: a mean immediately followed by its bounds with no
      // word between them.
      expect(hoverRow(2, 1).text).not.toMatch(
        new RegExp(`${ordinary.meanRating.toFixed(1)}\\s*·\\s*${lo.toFixed(1)}`),
      );
    });

    it("says whose interval it is in the panel's own captions, not only on hover", () => {
      // A tooltip only answers a reader who hovers. The static page has to carry
      // the same disambiguation or it still reads as a data range.
      const text = textOf(TravelComparison);
      expect(text, "heading").toContain("95% confidence intervals");
      expect(text, "caption under the chart").toContain(
        "95% CI for that side's mean, not the spread of the ratings",
      );
      // The gap between the means has an interval of its own, and it is a third
      // statistic again. Naming it stops it being read as either side's.
      expect(text, "caption above the chart").toContain("the 95% CI on that gap runs");
    });

    it("stays on screen and out of the pointer's way", () => {
      const { container } = hoverRow(0, 0);
      const tip = container.querySelector<HTMLElement>(".pointer-events-none");
      // jsdom lays nothing out, so the figure measures zero and the barcode's
      // clamp pins the box flush left at its 4px gutter. A box centered on the
      // pointer instead would sit at 108, which is off a figure this wide.
      expect(tip?.style.left).toBe("4px");
      expect(tip?.className).toContain("absolute");
    });

    it("drops the readout when the pointer leaves the panel", () => {
      const { container } = render(<TravelComparison stats={stats} />);
      const svg = container.querySelectorAll("svg")[0];
      fireEvent.mouseMove(svg, { clientX: 200, clientY: 10 });
      expect(tips(container)).toHaveLength(1);
      fireEvent.mouseLeave(svg);
      expect(tips(container)).toHaveLength(0);
    });

    it("answers below the last row with nothing, rather than with the near row", () => {
      // The axis strip under the bars belongs to neither side. A hit test that
      // clamped instead of returning nothing would put "Ordinary days" up while
      // the pointer sat on the tick labels.
      const { container } = render(<TravelComparison stats={stats} />);
      fireEvent.mouseMove(container.querySelectorAll("svg")[0], { clientX: 200, clientY: 80 });
      expect(tips(container)).toHaveLength(0);
    });
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
