"use client";

import { useMemo } from "react";
import { useTheme } from "@/lib/theme";
import type { Dataset } from "@/lib/types";
import { computeTravelStats, ratioLabel, signedLabel } from "@/lib/travelStats";
import { TravelSmallMultiple } from "./TravelSmallMultiple";
import { TravelComparison } from "./TravelComparison";
import { TravelCallout } from "./TravelCallout";
import { TravelMarkerLab } from "./TravelMarkerLab";

/**
 * The unlisted surface behind `/lab`: prototypes under review, before one of them
 * is promoted to the main page.
 *
 * This is the job the route was built for. It spent one phase reframed as a home
 * for retired charts, which is what emptied it out, because a chart good enough to
 * keep and redundant enough to move is rare and a chart that is WRONG gets deleted
 * instead. Prototyping is the recurring need: the alternative is trying three
 * presentations of one finding on the only page anybody reads.
 *
 * NO FILTER RAIL, and no `ExplorerProvider`. Deliberate, and the opposite of what
 * the route carried before. The tenants here are three presentations of ONE
 * finding measured on 21 watches, and the review question is which presentation
 * reads best. A filter that cut those 21 down to 4 would give each panel a
 * different number and turn the comparison into a comparison of arithmetic. The
 * figures are library-wide and every panel reads them from one
 * `computeTravelStats` call, so the three cannot disagree.
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

  const prototypes: Prototype[] = [
    {
      id: "small-multiple",
      n: 1,
      title: "Small multiple",
      aim: "One column per flight, films stacked inside it. Reads as: here are the flights, and here is what I watched on each.",
      caveat: `Ten columns of one to four films is very little data for a chart with axes. The y axis has four values on it and the tallest column reaches ${Math.max(
        ...stats.days.map((d) => d.films.length),
      )}. The rating wash is close to unreadable at this size, which is why each cell also prints its number, and a chart whose encoding needs the number printed beside it is most of the way to being a table.`,
      Chart: () => <TravelSmallMultiple stats={stats} />,
    },
    {
      id: "comparison",
      n: 2,
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
      n: 3,
      title: "Callout",
      aim: "No axes. The trips named, the films listed, the figures inline. The cheapest of the three.",
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
          Unlisted · under review
        </p>
        <h1
          className="font-display text-3xl font-bold tracking-tight"
          style={{ color: tokens.ink.primary }}
        >
          Three ways to say one thing about flying
        </h1>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          Prototypes waiting on a decision. All three draw the same figures from the same
          function, so the choice between them is a choice of presentation and not of claim.
          Nothing links here.
        </p>
      </header>

      {/* The claim, and the non-claim, stated once at the top so no panel below has
          to carry the whole caveat on its own. */}
      <div
        className="mb-12 border-t border-b py-4"
        style={{ borderColor: tokens.ink.grid }}
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold" style={{ color: tokens.ink.primary }}>
              The finding
            </dt>
            <dd className="mt-0.5" style={{ color: tokens.ink.secondary }}>
              {ratioLabel(stats.filmsPerDayRatio)} more films per day in the air, and a flight day
              is {ratioLabel(stats.multiFilmRatio)} likelier to hold more than one film.{" "}
              {stats.travel.watches} watches over {stats.travel.days} days.
            </dd>
          </div>
          <div>
            <dt className="font-bold" style={{ color: tokens.ink.primary }}>
              Not a finding
            </dt>
            <dd className="mt-0.5" style={{ color: tokens.ink.secondary }}>
              {stats.ratingGapIsNoise ? (
                <>
                  The rating does not move. {signedLabel(stats.ratingDiff)} points, interval{" "}
                  {signedLabel(stats.ratingDiffCi[0])} to {signedLabel(stats.ratingDiffCi[1])},
                  both medians {stats.travel.medianRating}. No panel here may imply I rate a film
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

        {/* Section 4 is not a fourth presentation of the travel finding, so it is
            rendered here rather than added to `prototypes`: its question is which
            MARK a flown watch should take, and "against it" is the wrong footer
            for a comparison that exists to be inconclusive until the owner picks. */}
        <section id="markers">
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold" style={{ color: tokens.ink.primary }}>
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: tokens.ink.muted }}
              >
                4.
              </span>{" "}
              Travel marker comparison
            </h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
              Whether a plane silhouette can replace the dart. Three candidates at three sizes and
              all three leg angles, then the same three in a real field of dots. Nothing here is
              wired to the swim lane; the dart ships until this is decided.
            </p>
          </div>

          <div
            className="rounded-sm p-5"
            style={{ background: tokens.surface.card, border: `1px solid ${tokens.ink.grid}` }}
          >
            <TravelMarkerLab data={data} />
          </div>

          <p className="mt-3 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
            <span className="font-bold">What to look for:</span> not which shape is prettiest in
            isolation, but what 21 marks of that shape do to a field of {stats.ordinary.watches}{" "}
            dots. A silhouette that only resolves at r 7 has lost, because r 5 is what ships. The
            weight figures under the grid are measured rather than judged by eye, and they
            contradict the usual complaint: at r 5 every candidate covers less ink than the dot it
            replaces.
          </p>
        </section>
      </div>
    </div>
  );
}
