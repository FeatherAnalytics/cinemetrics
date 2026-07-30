"use client";

import { useMemo } from "react";
import { useTheme } from "@/lib/theme";
import type { Dataset } from "@/lib/types";
import { computeTravelStats, ratioLabel, signedLabel } from "@/lib/travelStats";
import { computeEraStats } from "@/lib/gradSchool";
import { GradSchoolEra } from "./GradSchoolEra";
import { TravelComparison } from "./TravelComparison";
import { TravelCallout } from "./TravelCallout";

/**
 * The unlisted surface behind `/lab`: a permanent home for work that has not
 * earned a place on the main page.
 *
 * PERMANENT, not a staging area that empties. The route spent one phase framed as
 * a home for retired charts, which is what emptied it, because a chart good enough
 * to keep and redundant enough to move is rare and a chart that is WRONG gets
 * deleted instead. The need that actually recurs is the opposite one: something
 * worth looking at that is not yet worth publishing, either because a finding is
 * still choosing a presentation, or because a decision about a mark is open, or
 * because a number wants more data behind it before it means anything.
 *
 * Sections leave. They are promoted, or they are deleted once whatever question
 * they were asking is answered, and both are normal. The small multiple that used
 * to sit at the top of this page is the worked example: ten columns of one to four
 * films is too little data for a chart with axes, and the callout below said the
 * same thing better in prose, so it went. What survived that cut is the comparison,
 * because it is the only one that answers whether 2.10 films a day is a lot, which
 * the callout can assert and cannot show.
 *
 * NO FILTER RAIL, and no `ExplorerProvider`. Deliberate, and the opposite of what
 * the route carried before. The travel panels present ONE finding measured on 21
 * watches, and a filter that cut those 21 down to 4 would give each panel a
 * different number and turn a comparison of presentations into a comparison of
 * arithmetic. Everything here reads library-wide figures from one
 * `computeTravelStats` or `computeEraStats` call, so no two sections can disagree.
 */

type Prototype = {
  id: string;
  n: number;
  title: string;
  /** One line on what the presentation is TRYING to be. */
  aim: string;
  /** What is honestly wrong or thin about it. Not optional. */
  caveat: string;
  Chart: () => React.JSX.Element;
};

export function Lab({ data }: { data: Dataset }) {
  const { tokens } = useTheme();
  const stats = useMemo(() => computeTravelStats(data), [data]);
  const eraStats = useMemo(() => computeEraStats(data), [data]);

  const prototypes: Prototype[] = [
    {
      id: "comparison",
      n: 1,
      title: "Comparison",
      aim: `Travel days against ordinary days on the measures that answer. The headline is ${ratioLabel(
        stats.filmsPerDayRatio,
      )} more films, ratings unchanged.`,
      caveat:
        "Three measures, two marks each. Six marks is a table with a scale drawn on it, and the rating panel spends the most ink of the three on saying that nothing happened. That is the right thing to say and an expensive way to say it.",
      Chart: () => <TravelComparison stats={stats} />,
    },
    {
      id: "callout",
      n: 2,
      title: "Callout",
      aim: "No axes. The trips named, the films listed, the figures inline. The cheaper of the two.",
      caveat:
        "Prose does not scale and does not compare. It cannot show the ordinary-day baseline as anything but a number in a sentence, and if a reader wants to know whether 2.10 is a lot, this panel can only assert that it is.",
      Chart: () => <TravelCallout stats={stats} />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-10">
        <p
          className="font-mono text-xs tracking-[0.2em] uppercase"
          style={{ color: tokens.ink.muted }}
        >
          Unlisted · permanent
        </p>
        <h1
          className="font-display text-3xl font-bold tracking-tight"
          style={{ color: tokens.ink.primary }}
        >
          The lab
        </h1>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          Work that has not earned a place on the main page. Some of it is a finding still
          choosing how to be drawn, and some of it is a number that wants more data behind it
          before it means much. Sections leave when they are decided, promoted or deleted.
          Nothing links here and nothing will.
        </p>
      </header>

      {/* The claim, and the non-claim, stated once so neither travel panel has to
          carry the whole caveat on its own. Scoped to those two in the heading,
          because section 3 is not about flying and a bare "the finding"
          at the top of the page would read as governing them too. */}
      <div
        className="mb-12 border-t border-b py-4"
        style={{ borderColor: tokens.ink.grid }}
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold" style={{ color: tokens.ink.primary }}>
              The travel finding, for sections 1 and 2
            </dt>
            <dd className="mt-0.5" style={{ color: tokens.ink.secondary }}>
              {ratioLabel(stats.filmsPerDayRatio)} more films per day in the air, and a flight day
              is {ratioLabel(stats.multiFilmRatio)} likelier to hold more than one film.{" "}
              {stats.travel.watches} watches over {stats.travel.days} days.
            </dd>
          </div>
          <div>
            <dt className="font-bold" style={{ color: tokens.ink.primary }}>
              Not a travel finding
            </dt>
            <dd className="mt-0.5" style={{ color: tokens.ink.secondary }}>
              {stats.ratingGapIsNoise ? (
                <>
                  The rating does not move. {signedLabel(stats.ratingDiff)} points, interval{" "}
                  {signedLabel(stats.ratingDiffCi[0])} to {signedLabel(stats.ratingDiffCi[1])},
                  both medians {stats.travel.medianRating}. Neither panel may imply I rate a film
                  worse for having watched it on a plane.
                </>
              ) : (
                <>
                  The rating gap now sits outside its interval at{" "}
                  {signedLabel(stats.ratingDiff)} points, so this caveat needs rewriting rather
                  than repeating.
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* grid-cols-1 rather than a bare grid: an implicit track is max-content,
          which would ask a chart how wide it wants to be while the chart is asking
          the track the same question. See the note on useWidth. */}
      <div className="grid grid-cols-1 gap-14">
        {prototypes.map(({ id, n, title, aim, caveat, Chart }) => (
          <section key={id} id={id}>
            <div className="mb-4">
              <h2
                className="font-display text-xl font-bold"
                style={{ color: tokens.ink.primary }}
              >
                <span className="font-mono text-sm tabular-nums" style={{ color: tokens.ink.muted }}>
                  {n}.
                </span>{" "}
                {title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
                {aim}
              </p>
            </div>

            <div
              className="rounded-sm p-5"
              style={{ background: tokens.surface.card, border: `1px solid ${tokens.ink.grid}` }}
            >
              <Chart />
            </div>

            <p className="mt-3 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
              <span className="font-bold">Against it:</span> {caveat}
            </p>
          </section>
        ))}

        {/* Also not a travel section, and not a presentation question either. It
            is here because the honest answer is a null one, which is the third
            kind of thing this page exists to hold: too thin to headline the main
            page, and too easy to misread to leave undrawn. */}
        <section id="grad-school">
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold" style={{ color: tokens.ink.primary }}>
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: tokens.ink.muted }}
              >
                3.
              </span>{" "}
              The grad school years
            </h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
              I was in school from August 2023 to May 2025. Two rolling lines over the whole log,
              volume and rating, sharing one time axis with the span shaded on both. The question
              is what either line does when it reaches the shading.
            </p>
          </div>

          <div
            className="rounded-sm p-5"
            style={{ background: tokens.surface.card, border: `1px solid ${tokens.ink.grid}` }}
          >
            <GradSchoolEra stats={eraStats} />
          </div>

          <p className="mt-3 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
            <span className="font-bold">Why it is here and not on the main page:</span> the
            answer is a null one, and a null result needs its method shown before it means
            anything. Most of the words below are spent on which window was used and on what the
            charts cannot establish, which is the right ratio for a claim of this kind and a bad
            fit for a page a stranger skims. It also carries the correction to a figure an earlier
            draft of this page got wrong.
          </p>
        </section>
      </div>
    </div>
  );
}
