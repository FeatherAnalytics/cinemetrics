import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { GradSchoolEra } from "@/components/lab/GradSchoolEra";
import { fmt1 } from "@/lib/format";
import { ThemeProvider } from "@/lib/theme";
import {
  computeEraStats,
  GRAD_SCHOOL,
  monthIndex,
  PACE_MONTHS,
  paceSeries,
  RATING_WATCHES,
  ratingTrend,
  timeAt,
} from "../gradSchool";
import type { Dataset } from "../types";

/**
 * The shipped payload, not a fixture.
 *
 * Every number below is a claim about my actual viewing, and the section's whole
 * argument is that one obvious comparison has a confound behind it. A fixture would
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
      Number(w.perWeek.toFixed(2)),
      Number(w.meanRating.toFixed(1)),
    ]);
    expect(seen).toEqual([
      [480, 2.59, 71.0],
      [85, 1.63, 76.6],
      [169, 1.77, 77.4],
      [53, 1.02, 76.8],
    ]);
    // The four rates stay distinct at the one decimal the table prints: 2.6,
    // 1.6, 1.8, 1.0. Per week compresses them against the per-30-day version,
    // so a table with an apparent tie in it would be this assertion's job to
    // catch before a reader read two different stretches as equal.
    const shown = stats.neighbors.map((w) => w.perWeek.toFixed(1));
    expect(new Set(shown).size, `ties in ${shown.join(" ")}`).toBe(shown.length);
  });
});

/**
 * The two window widths, which are the numbers here that a well-meaning edit
 * would change and that would silently take the finding with them.
 */
describe("the two rolling windows", () => {
  it("keeps the pace window narrower than the era it has to resolve", () => {
    // At 24 this fails, which is the point. A window wider than the span cannot
    // produce a dip inside it, so smoothness there would be an artifact of the
    // method rather than a fact about the viewing.
    expect(PACE_MONTHS).toBeLessThan(stats.eraMonths);
    // And narrow enough to cover the span about twice, not merely to fit in it.
    expect(stats.eraMonths / PACE_MONTHS).toBeGreaterThanOrEqual(1.5);
  });

  it("keeps the rating window narrow enough to resolve the era too", () => {
    // Expressed in months, since that is the unit the era is in. The window
    // covers a couple of months at the span's own pace, so this line could show
    // a dip for the same reason the pace line could.
    const inside = stats.rating.filter(
      (p) => p.date >= GRAD_SCHOOL.start && p.date <= GRAD_SCHOOL.end,
    );
    const widest = Math.max(
      ...inside.map((p) => {
        const start = stats.rating[stats.rating.indexOf(p) - RATING_WATCHES + 1];
        return start ? p.time - start.time : 0;
      }),
    );
    expect(widest).toBeLessThan(stats.eraMonths / 2);
    expect(inside.length).toBe(stats.span.watches);
  });

  it("resolves a pace range that a 24-month window flattens away", () => {
    // The concrete cost of widening, asserted rather than argued.
    const twelve = paceSeries(rows, 12);
    const twentyFour = paceSeries(rows, 24);
    const spread = (s: typeof twelve) =>
      Math.max(...s.map((p) => p.filmsPerMonth)) - Math.min(...s.map((p) => p.filmsPerMonth));

    expect(twelve).toHaveLength(80);
    expect(twentyFour).toHaveLength(68);
    expect(spread(twelve)).toBeGreaterThan(spread(twentyFour));
  });

  it("windows the rating by watches so the line cannot swing on volume", () => {
    // The asymmetry between the two windows, asserted. Every point on the rating
    // line rests on exactly the same amount of evidence; that is the property a
    // time window would not have.
    expect(stats.rating).toHaveLength(
      data.watches.filter((w) => w.rating != null).length - RATING_WATCHES + 1,
    );
    const flat = ratingTrend(
      [
        { date: "2020-01-05", rating: 100 },
        { date: "2020-01-06", rating: 0 },
        { date: "2024-06-01", rating: 50 },
      ],
      2,
    );
    // Two points, each over two watches, regardless of the four-year gap between
    // the second and the third.
    expect(flat.map((p) => p.mean)).toEqual([50, 25]);
  });

  it("divides pace by the window width, so an empty month is a zero and not a gap", () => {
    const s = paceSeries(
      [
        { date: "2020-01-05", rating: 80 },
        { date: "2020-03-05", rating: 60 },
      ],
      3,
    );
    expect(s[0].filmsPerMonth).toBeCloseTo(2 / 3, 6);
  });

  it("puts both lines on one x unit so a single band can serve them", () => {
    // Fractional month index. If the two ever stopped agreeing on x, the shading
    // would sit in a different place on each chart and the comparison the section
    // asks the reader to make would be invalid.
    expect(timeAt("2023-08-01")).toBeCloseTo(monthIndex("2023-08"), 6);
    expect(timeAt("2023-08-16")).toBeGreaterThan(timeAt("2023-08-01"));
    expect(timeAt("2023-09-01")).toBeCloseTo(monthIndex("2023-08") + 1, 6);
    for (const p of stats.pace) expect(p.time).toBe(p.month);
  });
});

/**
 * The claims the copy makes about the lines, held to the series rather than to
 * the prose. If either line ever does step at an edge, the sentences saying it
 * does not have to fail.
 */
describe("what the lines do at the edges of the span", () => {
  /**
   * The line MOVES across the span, and no sentence may say it returns.
   *
   * At the ten-watch window the section's copy has to live with: it enters at 85
   * and leaves at 81. A wider window would bring it back to where it started and
   * make a stillness claim available again, which is exactly why this is pinned
   * to the series rather than to the prose.
   */
  it("does not return to where it entered, so the copy may not say it does", () => {
    expect(Math.abs(stats.opens.meanRating - stats.closes.meanRating)).toBeGreaterThan(1);
  });

  it("has the rating climb finish before the span opens", () => {
    const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
    expect(trough.year).toBeLessThan(Number(GRAD_SCHOOL.start.slice(0, 4)));
    // Most of the distance from the trough to the best year is already banked at
    // the moment the shading starts.
    const peak = Math.max(...stats.yearlyMeans.map((m) => m.mean));
    expect((stats.opens.meanRating - trough.mean) / (peak - trough.mean)).toBeGreaterThan(0.7);
  });

  it("finds the pace line moving inside the span, so the copy may not call it flat", () => {
    // The honest half. Neither line is actually still inside the span, and a
    // section describing them as flat would be wrong about both.
    const swing = stats.spanPaceRange.high.filmsPerMonth - stats.spanPaceRange.low.filmsPerMonth;
    expect(swing).toBeGreaterThan(1);
    expect(stats.spanPaceRange.high.filmsPerMonth).toBeGreaterThan(stats.opens.filmsPerMonth);
  });

  /**
   * The rank, and the reason the section does not lead on it.
   *
   * A ten-watch window wanders visibly everywhere, so "the rating line is flat
   * across the span" would be an eyeball claim the chart contradicts. What is
   * checkable is where the span's movement sits among comparable stretches, and
   * the answer is the middle. The copy says middling and says there is no
   * stillness finding; this guard is what stops it drifting into a headline.
   */
  it("ranks the span as a middling stretch, not a still one", () => {
    expect(stats.ratingStretch.comparable).toBeGreaterThan(30);
    // Not the top decile, which is the only place a stillness claim would be
    // honest. If this ever drops under 25 the section may lead on it, but the
    // sentence has to be rewritten in the same commit.
    expect(stats.ratingStretch.netPercentile).toBeGreaterThan(25);
    expect(stats.ratingStretch.netPercentile).toBeLessThan(60);
    // And the swing inside is unremarkable, which is why the copy claims neither
    // the net nor the shape as a finding.
    expect(stats.ratingStretch.swing).toBeGreaterThan(5);
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

  it("locates the against-everything gap in the early years", () => {
    // Why the span-against-everything split is the wrong one, held as a fact
    // about the data rather than only as a comment.
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
      expect(text, `${w.label} rate`).toContain(w.perWeek.toFixed(1));
      expect(text, `${w.label} mean`).toContain(w.meanRating.toFixed(1));
    }
  });

  it("states both window choices where the reader can see them", () => {
    const text = textOf();
    // The pace window's justification, including the number that would break it.
    expect(text).toContain("Two windows, because the two measures need different ones");
    expect(text).toContain(`the span is ${stats.eraMonths} months`);
    expect(text).toContain("twenty-four month window would be wider");
    // And the rating window's, which is a different argument entirely.
    expect(text).toContain(`${RATING_WATCHES} watch window`);
    expect(text).toContain("swing on how much I watched rather than on how I rated it");
  });

  /**
   * The wording rules, which are the half the owner and the lead both cared
   * about. The section may not overclaim, and it may not misuse "significant".
   */
  it("refuses the causal reading without claiming to have disproved it", () => {
    const text = textOf();
    expect(text).toContain("The trend walks straight through it");
    expect(text).toContain("A chart cannot establish an absence");
    // The closing line, which the owner asked to keep. It says what the section
    // is not evidence of without claiming to have ruled anything out.
    expect(text).toContain("It is not evidence that school did it");
    // And the rank is labelled as a rank. Overlapping stretches are not
    // independent samples, so the percentile may not be dressed up as a test.
    expect(text).toContain("rank among overlapping stretches rather than a test");
    // The banned construction, in either half. "Not significant" is not a
    // finding, and a chart cannot establish absence, so it misuses the word twice.
    expect(text).not.toMatch(/not significant/i);
    expect(text).not.toMatch(/itself significant/i);
    expect(text).not.toMatch(/statistically significant/i);
  });

  /**
   * The misleading split, named on the page as a property of the data.
   *
   * The page narrates no draft history: it has never been published, so there is
   * no reader carrying a memory of an older figure, and a sentence that only
   * parses as a correction would be talking to nobody. What has to survive is
   * the caution itself, in the present tense, because the trap is real and a
   * reader who meets the bigger number elsewhere needs it explained here.
   */
  it("names the against-everything comparison as the wrong one, in the present tense", () => {
    const text = textOf();
    expect(text).toContain(
      `Set the span against everything outside it and the rating looks ${fmt1(
        stats.vsOutside.ratingDiff,
      )} points higher`,
    );
    expect(text).toContain("That is the wrong comparison");
    // The reason, which is the part that makes it a caution rather than a fact.
    const [early] = stats.neighbors;
    expect(text).toContain(`${early.watches} of the ${stats.outsideWatches} watches`);
    // And no draft history anywhere in the section.
    expect(text).not.toMatch(/earlier draft|previous version|used to (say|report)|stopped saying/i);
    // The gap is DERIVED. A literal reading 5.0 would satisfy every assertion
    // above, because 5.0 is what the payload computes today, so the only way to
    // tell the two apart is to look at the source.
    const src = readFileSync(
      path.join(__dirname, "../../components/lab/GradSchoolEra.tsx"),
      "utf8",
    );
    expect(src, "the gap must be read, not typed").toContain("fmt1(vsOutside.ratingDiff)");
  });

  it("says out loud that the volume line is not flat", () => {
    // Guards against the section growing a tidy symmetrical "both lines are flat"
    // sentence, which would be wrong about one of them.
    expect(textOf()).toContain("not flat inside the span");
  });

  /**
   * The stillness language, banned outright.
   *
   * At this window the rank does not support a stillness claim, and the failure
   * mode is a sentence that asserts one anyway on the strength of how the phrase
   * sounds. The words that would do it may not appear at all.
   */
  it("claims no stillness in words either, now that the rank does not support one", () => {
    const text = textOf();
    expect(text).toContain("middling stretch, not a still one");
    expect(text).toContain("no stillness finding");
    expect(text).not.toMatch(/quieter than/i);
    expect(text).not.toMatch(/\bstillest\b/i);
    expect(text).not.toMatch(/the span was calm/i);
  });

  /**
   * The window's width in months, which is the figure that went stale silently
   * the last time the window changed. It is derived, so it may not be a literal.
   */
  it("reads the window's width in months off the payload", () => {
    const { low, high } = stats.ratingWindowMonths;
    expect(textOf()).toContain(`one window covers ${fmt1(low)} to ${fmt1(high)} months`);
    // Far short of the span, which is the only property the section needs from
    // it: a dip inside the era could show.
    expect(high).toBeLessThan(stats.eraMonths / 4);
  });

  it("puts the steep fall after the span rather than inside it", () => {
    // The half a skimmer is likeliest to get backwards. The real collapse in
    // viewing is AFTER graduation, so a sentence that let it drift inside the
    // shading would hand the reader the causal story the section refuses.
    const [, , span, after] = stats.neighbors;
    const text = textOf();
    expect(text).toContain("the steepest decline in the log comes after it closes");
    expect(text).toContain(`${fmt1(after.perWeek)} watches a week`);
    expect(text).toContain(`against ${fmt1(span.perWeek)} inside`);
    // One unit for this quantity across the whole page. A converted figure under
    // an unconverted label is worse than either.
    expect(text).not.toMatch(/per 30 days|\/30d/);
  });

  it("puts the rating climb before the span rather than inside it", () => {
    // The other direction of the same error. The level was already up when the
    // shading starts, so the climb may not read as something school produced.
    const text = textOf();
    expect(text).toContain("finishes before the shading starts");
    const trough = stats.yearlyMeans.reduce((a, b) => (b.mean < a.mean ? b : a));
    expect(text).toContain(`running up from ${fmt1(trough.mean)} in ${trough.year}`);
  });

  /**
   * A budget for this section alone, because the page budget cannot see it.
   *
   * 458 rendered words before the trim, 380 after it, 405 now. The cap went from
   * 400 to 425 once, on purpose and with the reason recorded: the window went
   * from forty watches to ten, the stillness finding went with it, and saying
   * "middling, and here is why that is not a finding" costs more words than
   * "quieter than 92% of comparable stretches" did. A weaker claim stated
   * carefully is longer than a strong one stated flat, and the honest version is
   * the one that ships.
   *
   * That is the only reason this number may ever go UP. Twenty words of headroom
   * is a sentence, which is enough for a figure that genuinely needs one and not
   * enough for a paragraph. The total counts the neighbor table and both axes,
   * none of which is prose.
   */
  it("holds the grad school section to its own word budget", () => {
    expect(textOf().trim().split(" ").length).toBeLessThan(425);
  });

  it("never spends the accent on era chrome", () => {
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/#c01023|#ff4757/i);
  });

  /**
   * The hover readout, which is what makes a wandering line legible without
   * smoothing it. jsdom has no layout, so every rect is zero wide and the hit
   * test lands on the leftmost point of whichever line was hovered. That is
   * enough to prove the parts under test: which SERIES answered, that it named a
   * DATE and a VALUE, and that the box clamps on screen rather than hanging off
   * the left edge the way an unclamped one would at x=0.
   */
  describe("the hover readout", () => {
    const tip = (container: HTMLElement) =>
      container.querySelector<HTMLElement>(".pointer-events-none");

    it("shows nothing until the pointer is over a panel", () => {
      expect(tip(mount().container)).toBeNull();
    });

    it("reads the rating line as a mean at a date", () => {
      const { container } = mount();
      const svg = container.querySelectorAll("svg")[0];
      fireEvent.mouseMove(svg, { clientX: 0, clientY: 40 });
      const text = (tip(container)?.textContent ?? "").replace(/\s+/g, " ");
      // The first point of the rating line: the watch its window closes
      // on, and the mean over that window.
      const first = stats.rating[0];
      expect(text).toContain(first.mean.toFixed(1));
      expect(text).toContain(`over ${RATING_WATCHES} watches`);
      expect(text).toContain(String(Number(first.date.slice(8, 10))));
      expect(text).toContain(first.date.slice(0, 4));
    });

    it("reads the pace line as a rate at a month, not as the rating", () => {
      const { container } = mount();
      const svg = container.querySelectorAll("svg")[1];
      fireEvent.mouseMove(svg, { clientX: 0, clientY: 40 });
      const text = (tip(container)?.textContent ?? "").replace(/\s+/g, " ");
      const first = stats.pace[0];
      expect(text).toContain("films a month");
      expect(text).toContain(`trailing ${PACE_MONTHS}`);
      // Two lines on one axis with two different windows: a readout that quoted
      // the rating window here would be describing the panel above.
      expect(text).not.toContain(`${RATING_WATCHES} watches`);
      expect(text).toContain(String(first.filmsPerMonth % 1 === 0 ? first.filmsPerMonth : first.filmsPerMonth.toFixed(1)));
    });

    it("clamps the box inside the figure and leaves the marks alone", () => {
      const { container } = mount();
      const svg = container.querySelectorAll("svg")[0];
      fireEvent.mouseMove(svg, { clientX: 0, clientY: 40 });
      // jsdom lays nothing out, so the figure measures zero and the barcode's
      // clamp pins the box flush left at its 4px gutter. Centered on the pointer
      // it would start 92px left of the figure instead.
      expect(tip(container)?.style.left).toBe("4px");
      expect(tip(container)?.style.pointerEvents).not.toBe("auto");
      // The marker is a rule and a dot, so the assertions above about two rects
      // and one path per panel still hold while a tooltip is up.
      expect(container.querySelectorAll("rect")).toHaveLength(2);
      for (const s of container.querySelectorAll("svg")) {
        expect(s.querySelectorAll("path")).toHaveLength(1);
      }
      expect(svg.querySelectorAll("circle")).toHaveLength(1);
    });

    it("drops the readout when the pointer leaves", () => {
      const { container } = mount();
      const svg = container.querySelectorAll("svg")[0];
      fireEvent.mouseMove(svg, { clientX: 0, clientY: 40 });
      expect(tip(container)).not.toBeNull();
      fireEvent.mouseLeave(svg);
      expect(tip(container)).toBeNull();
    });
  });
});
