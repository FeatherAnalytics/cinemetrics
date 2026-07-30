"use client";

import { useMemo } from "react";
import { hairline, useTheme } from "@/lib/theme";
import type { Dataset } from "@/lib/types";
import { computeTravelStats, ratioLabel } from "@/lib/travelStats";
import { computeEraStats } from "@/lib/gradSchool";
import { GradSchoolEra } from "./GradSchoolEra";
import { LabRail } from "./LabRail";
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
 *
 * There IS a left column, and that is not a reversal of the paragraph above. The
 * landing page seats its content beside a 18rem rail, so a page without one starts
 * against the margin and reads as somewhere else; `LabRail` takes that geometry
 * and fills it with the page's figures and its section list, which are readouts
 * and not controls. The pages line up and the 21 watches stay 21.
 *
 * SECTIONS ARE NOT NUMBERED, and their order is arrival, not strength. The main
 * page numbers nothing, and a rank in the heading would invite renumbering the
 * page every time a figure moved.
 */

type Prototype = {
  id: string;
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
      title: "Comparison",
      aim: `Travel days against ordinary days on the measures that answer: ${ratioLabel(
        stats.filmsPerDayRatio,
      )} more films, ratings unchanged.`,
      caveat:
        "Six marks is a table with a scale drawn on it, and the rating panel spends the most ink of the three on saying that nothing happened. That is the right thing to say and an expensive way to say it.",
      Chart: () => <TravelComparison stats={stats} />,
    },
    {
      id: "callout",
      title: "Callout",
      aim: "No axes. The trips named, the films listed, the figures inline. The cheaper of the two.",
      caveat:
        "Prose does not compare. The ordinary-day baseline can only be a number in a sentence, so a reader asking whether 2.10 is a lot has nothing but this panel's word for it.",
      Chart: () => <TravelCallout stats={stats} />,
    },
  ];

  const sections = [
    ...prototypes.map(({ id, title }) => ({ id, title })),
    { id: "grad-school", title: "The grad school years" },
  ];

  return (
    // The landing page's shell, to the pixel: same max width, same padding, same
    // rail-then-content flex. Two pages that share a rail and not a container
    // would line their rails up and none of the content beside them.
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-6">
        <p
          className="font-mono text-xs tracking-[0.2em] uppercase"
          style={{ color: tokens.ink.muted }}
        >
          Unlisted · permanent
        </p>
        <h1
          className="font-display text-4xl font-bold tracking-tight"
          style={{ color: tokens.ink.primary }}
        >
          The lab
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          Work that has not earned a place on the main page: a finding still choosing how to be
          drawn, or a number that wants more data behind it. Sections leave when they are decided,
          promoted or deleted. Nothing links here.
        </p>
      </header>

      <div className="lg:flex lg:gap-8">
        <LabRail sections={sections} stats={stats} eraStats={eraStats} />

        <div className="min-w-0 flex-1">
          {/* grid-cols-1 rather than a bare grid: an implicit track is max-content,
              which would ask a chart how wide it wants to be while the chart is asking
              the track the same question. See the note on useWidth. */}
          <div className="grid grid-cols-1 gap-12">
            {prototypes.map(({ id, title, aim, caveat, Chart }) => (
              <section key={id} id={id} className="scroll-mt-6">
                <h2
                  className="font-display text-lg font-semibold"
                  style={{ color: tokens.ink.primary }}
                >
                  {title}
                </h2>
                <p className="mb-2 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
                  {aim}
                </p>

                <div
                  className="rounded-md border p-4"
                  style={{
                    background: "var(--surface-card)",
                    borderColor: hairline(tokens.ink.primary, 9),
                  }}
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
            <section id="grad-school" className="scroll-mt-6">
              <h2
                className="font-display text-lg font-semibold"
                style={{ color: tokens.ink.primary }}
              >
                The grad school years
              </h2>
              <p className="mb-2 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
                I was in school from August 2023 to May 2025. Two rolling lines over the whole log,
                rating and volume, on one time axis with the span shaded on both. Neither line does
                anything at the shading, which is the finding.
              </p>

              <div
                className="rounded-md border p-4"
                style={{
                  background: "var(--surface-card)",
                  borderColor: hairline(tokens.ink.primary, 9),
                }}
              >
                <GradSchoolEra stats={eraStats} />
              </div>

              <p className="mt-3 max-w-2xl text-xs" style={{ color: tokens.ink.muted }}>
                <span className="font-bold">Why it is here and not on the main page:</span> the
                section spends more words refusing the causal reading than stating the finding.
                That is the right ratio and a bad fit for a page a stranger skims, because a null
                result needs its method shown before it means anything. It also carries the
                correction to a figure an earlier draft got wrong.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
