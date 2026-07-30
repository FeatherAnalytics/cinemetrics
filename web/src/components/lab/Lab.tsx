"use client";

import { ExplorerProvider, useExplorer } from "@/lib/store";
import { RecommendProvider } from "@/lib/recommendStore";
import { useTheme } from "@/lib/theme";
import { SelectionPanel } from "@/components/SelectionPanel";
import { FilterBar } from "@/components/FilterBar";
import type { Dataset } from "@/lib/types";
import { LikedByRating, LikedByRatingBlurb } from "./LikedByRating";
import { WhatMovesTheHeart } from "./WhatMovesTheHeart";
import { FavsAmongTheBest, FavsAmongTheBestBlurb } from "./FavsAmongTheBest";
import { FavDirectors, FavDirectorsBlurb } from "./FavDirectors";
import { FavPosters } from "./FavPosters";

/**
 * The unlisted surface behind `/lab`. Not linked from anywhere, and it stays
 * that way.
 *
 * It holds two kinds of chart. Charts on their way somewhere, because
 * prototyping on the main page means shipping half-formed work to the only page
 * anybody reads. And charts on their way nowhere: correct, but redundant next to
 * what the main narrative already says. This route used to be torn down whenever
 * the first group emptied out; it is kept now so the second group has somewhere
 * to go that is not deletion.
 *
 * TWO GROUPS, ONE PROVIDER. The heart charts and the favorites charts are headed
 * for different stories, but they mount inside a single `ExplorerProvider` so a
 * click in one group cross-filters the other. Two providers would give each group
 * its own filter state, and a prototype that cannot be tested under the same
 * filter as its neighbor is exactly the gap that shipped four defects out of the
 * stats work.
 */

type Section = {
  id: string;
  title: string;
  blurb?: string;
  Blurb?: () => React.JSX.Element | null;
  Chart: () => React.JSX.Element | null;
};

type Group = {
  id: string;
  title: string;
  /** Drawn under the group note, above its sections. */
  Lead?: () => React.JSX.Element | null;
  note: (ctx: {
    known: number;
    inView: number;
    unknown: number;
    recovered: number;
  }) => React.ReactNode;
  sections: Section[];
};

const GROUPS: Group[] = [
  {
    id: "heart",
    title: "The heart",
    note: ({ known, inView, unknown, recovered }) => (
      <>
        {known} of {inView} watches in view have a known heart
        {recovered > 0 && (
          <>
            , {recovered} of them recovered from a later watch of the same film, since
            hearting is one toggle per film rather than per viewing
          </>
        )}
        {unknown > 0 && (
          <>
            . The remaining {unknown} pre-Letterboxd{" "}
            {unknown === 1 ? "row belongs" : "rows belong"} to films never watched again, so
            they stay unknown and are excluded from every rate here
          </>
        )}
        .
      </>
    ),
    sections: [
      {
        id: "by-rating",
        title: "The heart follows the rating",
        Blurb: LikedByRatingBlurb,
        Chart: LikedByRating,
      },
      {
        id: "predictors",
        title: "Nothing decides the ones in between",
        // Describes the METHOD, not the result. "Every dimension sits on the band
        // average" is true of the full library and false under a narrow filter,
        // where one Comedy watch draws a 100% column; a static sentence cannot
        // make a claim the rail is free to falsify.
        blurb:
          "Only watches at 3.5★ and 4★, so a dimension that merely predicts my rating cannot show up here as predicting the heart.",
        Chart: WhatMovesTheHeart,
      },
    ],
  },
  {
    id: "favorites",
    title: "Four favorites",
    Lead: FavPosters,
    note: () => (
      <>
        The four films on the Letterboxd profile, curated by hand. Nothing in the data
        picks them out, and these charts are mostly about that.
      </>
    ),
    sections: [
      {
        id: "among-the-best",
        title: "Four of nineteen",
        Blurb: FavsAmongTheBestBlurb,
        Chart: FavsAmongTheBest,
      },
      {
        id: "directors",
        title: "A favorite brings company",
        Blurb: FavDirectorsBlurb,
        Chart: FavDirectors,
      },
    ],
  },
];

function Body() {
  const { filtered } = useExplorer();
  const { tokens } = useTheme();
  // All three counted IN VIEW, so the sentence describes the charts beside it
  // instead of films the filter has already removed. `unknown` in particular is
  // "the remaining" of `inView`, so taking it from the whole library made the note
  // claim more watches than the charts hold: filtered to 2023 it read "100 of 100
  // have a known heart, the remaining 98 stay unknown".
  const known = filtered.filter((w) => w.heart != null).length;
  const recovered = filtered.filter((w) => w.liked == null && w.heart != null).length;
  const unknown = filtered.length - known;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p
          className="font-mono text-xs uppercase tracking-[0.2em]"
          style={{ color: tokens.ink.muted }}
        >
          Unlisted
        </p>
        <h1
          className="font-display text-3xl font-bold tracking-tight"
          style={{ color: tokens.ink.primary }}
        >
          The cutting room
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.ink.secondary }}>
          Charts that work but lost their place in the main narrative. Kept because being
          redundant is not the same as being wrong.
        </p>
      </header>

      {/* The rail runs across the top rather than down the side: these charts
          measure their own column, and a sidebar would make that column a
          different width here than on the page they are headed for. */}
      <div className="mb-10">
        <FilterBar />
      </div>

      {/* grid-cols-1 rather than a bare grid: an implicit track is max-content,
          which would ask the charts how wide they want to be while they are
          asking the track the same question. See the note on useWidth. */}
      <div className="grid grid-cols-1 gap-16">
        {GROUPS.map((g) => (
          <div key={g.id} className="grid grid-cols-1 gap-12">
            <header>
              <h2 className="text-xl font-bold" style={{ color: tokens.ink.primary }}>
                {g.title}
              </h2>
              <p className="mt-1 text-sm" style={{ color: tokens.ink.muted }}>
                {g.note({ known, inView: filtered.length, unknown, recovered })}
              </p>
              {g.Lead && (
                <div className="mt-4">
                  <g.Lead />
                </div>
              )}
            </header>

            {g.sections.map(({ id, title, blurb, Blurb, Chart }) => (
              <section key={id}>
                <h3 className="text-lg font-bold" style={{ color: tokens.ink.primary }}>
                  {title}
                </h3>
                {Blurb ? (
                  <div className="mt-1 mb-3">
                    <Blurb />
                  </div>
                ) : (
                  blurb && (
                    <p className="mt-1 mb-3 text-sm" style={{ color: tokens.ink.secondary }}>
                      {blurb}
                    </p>
                  )
                )}
                <Chart />
              </section>
            ))}
          </div>
        ))}

        <SelectionPanel />
      </div>
    </div>
  );
}

export function Lab({ data }: { data: Dataset }) {
  // FilterBar reaches for the recommend store to clear the drawer when a filter
  // moves, so the rail cannot be mounted without it even though nothing on this
  // page opens the drawer.
  return (
    <RecommendProvider>
      <ExplorerProvider data={data}>
        <Body />
      </ExplorerProvider>
    </RecommendProvider>
  );
}
