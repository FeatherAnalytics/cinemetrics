"use client";

import { hairline, useTheme } from "@/lib/theme";
import { fmt1 } from "@/lib/format";
import { ratioLabel, signedLabel, type TravelStats } from "@/lib/travelStats";
import type { EraStats } from "@/lib/gradSchool";

/**
 * The lab's left column: the same geometry as the landing page's filter rail,
 * carrying the page's headline figures and its section list instead of controls.
 *
 * WHY A RAIL AND WHY NOT FILTERS. The landing page puts a 18rem column left of
 * its content, so a page without one starts hard against the margin and reads as
 * a different site. What may not go in it here is a filter: the travel panels
 * present one finding measured on 21 watches, and a control that cut those 21
 * down to 4 would give each panel a different number. So the column takes the
 * geometry and leaves the arithmetic alone. See the note in Lab.tsx.
 *
 * BELOW lg it is a card in the flow above the content, not a drawer. The landing
 * page hides its rail behind a button because a filter panel is tall, is used
 * repeatedly, and covers the charts it drives. Four figures and three links are
 * none of those things: they fit in a few lines, they are read once, and a drawer
 * would put a tap in front of a table of contents that is cheaper to just show.
 *
 * Every figure comes off `stats` or `eraStats` at render. Nothing here is typed
 * in, so no number in this column can outlive the data behind it.
 */

/** One headline figure, in the landing page's stat-tile treatment. */
function Figure({ value, label, note }: { value: string; label: string; note: string }) {
  const { tokens } = useTheme();
  return (
    <div className="min-w-0">
      <div
        className="text-lg font-bold leading-tight lg:text-xl"
        style={{ color: tokens.ink.primary }}
      >
        {value}
      </div>
      <div
        className="font-mono text-[9px] uppercase tracking-[0.1em]"
        style={{ color: tokens.ink.muted }}
      >
        {label}
      </div>
      <div className="font-mono text-[9px]" style={{ color: tokens.ink.muted }}>
        {note}
      </div>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  const { tokens } = useTheme();
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color: tokens.ink.muted }}
    >
      {children}
    </div>
  );
}

export function LabRail({
  sections,
  stats,
  eraStats,
}: {
  sections: { id: string; title: string }[];
  stats: TravelStats;
  eraStats: EraStats;
}) {
  const { tokens } = useTheme();

  return (
    <aside
      className="rail-column mb-8 lg:mb-0"
      aria-label="Key figures and sections"
    >
      <div
        className="rounded-lg border p-3 lg:sticky lg:top-6"
        style={{ borderColor: hairline(tokens.ink.primary, 14) }}
      >
        <Heading>On this page</Heading>
        {/* Two columns in the rail and four across the card below lg, so the
            figures spread with the width they are given rather than stacking
            into a tall list on a phone. */}
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <Figure
            value={ratioLabel(stats.filmsPerDayRatio)}
            label="films a day"
            note={`${stats.travel.filmsPerDay.toFixed(2)} v ${stats.ordinary.filmsPerDay.toFixed(2)}`}
          />
          <Figure
            value={`${Math.round(stats.travel.multiFilmShare * 100)}%`}
            label="days, 2+ films"
            note={`${stats.travel.multiFilmDays} of ${stats.travel.days} flying`}
          />
          <Figure
            /* Looked up and not written down, for the reason the panels branch
               too: the word has to stop saying "unchanged" if the data stops
               agreeing. The signed gap is the note rather than the headline,
               because a skimmer reading "+1.6" alone would take a null result
               for a finding. */
            value={stats.ratingGapIsNoise ? "Unchanged" : "Changed"}
            label="rating gap"
            note={`${signedLabel(stats.ratingDiff)} pts, ${stats.travel.ratingN} watches`}
          />
          <Figure
            value={`${eraStats.eraMonths} mo`}
            label="in school"
            note={`${eraStats.span.watches} watches, ${fmt1(eraStats.span.per30)}/30d`}
          />
        </div>

        <div
          className="my-3 border-t"
          style={{ borderColor: hairline(tokens.ink.primary, 10) }}
        />

        <Heading>Sections</Heading>
        {/* A wrapping row below lg and a list in the rail. Plain anchors: these
            are in-page hashes, so unlike a route they need nothing from the
            basePath next/link would prepend. */}
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 lg:flex-col lg:gap-y-1.5">
          {sections.map(({ id, title }) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-sm transition hover:text-[color:var(--foreground)]"
              style={{ color: tokens.ink.secondary }}
            >
              {title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
