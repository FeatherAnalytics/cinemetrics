import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY PUBLISHED FIGURE IS READ, NOT TYPED, and only the source can prove it.
 *
 * The hole this closes: a literal that happens to match today's computed value
 * passes every assertion made against rendered output. `vsOutside.ratingDiff`
 * renders "5.0"; so does the string "5.0". Nothing a test can see in the DOM
 * distinguishes a derivation from a number someone pasted in while it was
 * briefly correct, and the paste then keeps asserting that value forever after
 * the data moves.
 *
 * So the check is on the source: the derived expression has to appear. It
 * cannot catch a figure derived the WRONG way, which is what the payload
 * assertions elsewhere are for; it catches the figure that stopped being
 * derived at all.
 *
 * ONE FILE FOR THE WHOLE SITE, and that is the point of it living here rather
 * than beside the tests for any one page. The first version of this guard sat
 * inside the lab page's own test file, which quietly scoped it to the lab page:
 * a typed year in the landing page's barcode caption and a typed rate in the
 * lab's own caveat both sat outside it and neither was caught. A figure is
 * published or it is not, so the list is keyed by file and every surface that
 * prints a number belongs in it.
 *
 * The neighbor table leads the list deliberately. Its whole job is to be the
 * comparison that shows the against-everything gap is an artifact, so a frozen
 * literal there would go on vouching for a caveat that had quietly stopped
 * being true.
 */
const src = (rel: string) => readFileSync(path.join(__dirname, "../..", rel), "utf8");

/**
 * Whitespace and a magic trailing comma removed from both sides before matching.
 *
 * Prettier decides where these expressions wrap, and it rewraps them whenever
 * the prose around them changes length. Matching the formatter's output would
 * make an edit to a sentence fail a test about a number.
 */
const squash = (s: string) => s.replace(/\s+/g, "").replace(/,\)/g, ")");

const REQUIRED: Record<string, string[]> = {
  "components/lab/GradSchoolEra.tsx": [
    // The neighbor table, whole. Rows come from the array, and each cell
    // reads its own field, so neither the set of stretches nor any one
    // number in them can be pinned.
    "stats.neighbors.map(",
    "{win.watches}",
    "{win.perWeek.toFixed(1)}",
    "{fmt1(win.meanRating)}",
    "{win.label}",
    // The against-everything gap, which is the figure the table exists to
    // put in context.
    "fmt1(vsOutside.ratingDiff)",
    // The rank, both halves. A frozen percentile would keep calling a
    // stretch middling after it stopped being one.
    "Math.round(ratingStretch.netPercentile)",
    "{ratingStretch.comparable}",
    "fmt1(ratingStretch.netDelta)",
    // The window's width in months, the figure that already went stale once
    // as a literal when the window changed underneath it.
    "fmt1(ratingWindowMonths.low)",
    "fmt1(ratingWindowMonths.high)",
    // What the rating line reads at each edge of the span.
    "opens.meanRating.toFixed(1)",
    "closes.meanRating.toFixed(1)",
    // The pace figures either side of the span.
    "fmt1(after.perWeek)",
    "fmt1(span.perWeek)",
  ],
  "components/lab/LabRail.tsx": [
    "ratioLabel(stats.filmsPerDayRatio)",
    "stats.travel.filmsPerDay.toFixed(2)",
    "stats.ordinary.filmsPerDay.toFixed(2)",
    "Math.round(stats.travel.multiFilmShare * 100)",
    "stats.travel.multiFilmDays",
    "signedLabel(stats.ratingDiff)",
    "stats.travel.ratingN",
    "eraStats.eraMonths",
    "eraStats.span.watches",
    "eraStats.span.perWeek.toFixed(1)",
    // The null result as a WORD, looked up. A typed "Unchanged" would keep
    // saying it after the data stopped agreeing.
    "stats.ratingGapIsNoise ?",
  ],
  "components/lab/Lab.tsx": [
    // The prototype blurbs. Both an `aim` and a `caveat` quote a figure the
    // panel below them draws, which is exactly the pairing that lets copy and
    // chart drift apart without either looking wrong on its own.
    "ratioLabel(stats.filmsPerDayRatio)",
    "stats.travel.filmsPerDay.toFixed(2)",
    // The span the grad school section is about, in the prose above the chart.
    // The chart's own band label already derives it, so a literal here is one
    // of two copies of the same two dates with nothing holding them together.
    'monthLabel(GRAD_SCHOOL.start, "long")',
    'monthLabel(GRAD_SCHOOL.end, "long")',
  ],
  "components/ExplorerApp.tsx": [
    // Both of these were sentences with a year in them. The barcode caption
    // has to follow the FILTER rather than the log, and the heart caption
    // counts watches the lens dims, so neither can be a string in this array.
    "<PosterBarcodeBlurb />",
    "<SwimLaneHeartBlurb />",
  ],
  "components/PosterBarcode.tsx": [
    // The caption and the canvas's accessible name, from one helper, so the
    // two cannot answer the same question differently.
    "firstWatchYear(filtered)",
    "firstWatchYear(watches)",
  ],
  "components/SwimLaneChart.tsx": ["{unrecorded.span}", "{unrecorded.n} watches there"],
  "components/StreakStripes.tsx": [
    // The gems legend states the rule the stripes are colored by, and the
    // threshold is exported precisely so the two cannot disagree.
    "rated ${GEM_MIN_RATING}+",
    "rated under ${GEM_MIN_RATING}",
  ],
  "lib/stories.ts": [
    // Story headlines and teasers. Each of these names a threshold the same
    // function filters on a few lines above.
    "${LONG_MIN}-min+",
    "sub-${SHORT_MAX}s",
    "before ${PRE_MILLENNIUM}",
    "predate ${PRE_MILLENNIUM}",
    "${GEM_MIN_RATING} or above",
    "${GEM_MAX_VOTES.toLocaleString()}",
  ],
};

describe("published figures are read off the data, never typed", () => {
  it.each(Object.entries(REQUIRED))("%s", (file, expressions) => {
    const text = squash(src(file));
    for (const expr of expressions) {
      expect(text, `${file} must read ${expr}, not type its value`).toContain(squash(expr));
    }
  });
});
