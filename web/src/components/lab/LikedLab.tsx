"use client";

import { ExplorerProvider, useExplorer } from "@/lib/store";
import { RecommendProvider } from "@/lib/recommendStore";
import { INK } from "@/lib/palette";
import { SelectionPanel } from "@/components/SelectionPanel";
import { FilterBar } from "@/components/FilterBar";
import type { Dataset } from "@/lib/types";
import { LikedByRating, LikedByRatingBlurb } from "./LikedByRating";
import { WhatMovesTheHeart } from "./WhatMovesTheHeart";
import { AdmiredNotLoved, AdmiredNotLovedBlurb } from "./AdmiredNotLoved";
import { AffectionOverTime } from "./AffectionOverTime";

/**
 * Prototype surface for the `liked` charts. Not linked from anywhere.
 *
 * `/lab` exists to be deleted: it was torn down once the stats charts were
 * promoted onto the main page, and it comes back for the same reason it existed
 * the first time, which is that prototyping on the main page means shipping
 * half-formed charts to the only page anybody reads.
 *
 * The filter rail is here on purpose. Four separate defects shipped from the
 * stats work because every chart was only ever looked at against the full 794
 * watches; a prototype surface without a rail cannot be tested under a narrow
 * filter, so the rail is part of the prototype rather than a later addition.
 */

type Section = {
  id: string;
  title: string;
  blurb: string;
  Blurb?: () => React.JSX.Element | null;
  Chart: () => React.JSX.Element | null;
};

const SECTIONS: Section[] = [
  {
    id: "by-rating",
    title: "The heart follows the rating",
    blurb: "",
    Blurb: LikedByRatingBlurb,
    Chart: LikedByRating,
  },
  {
    id: "predictors",
    title: "Nothing decides the ones in between",
    // Describes the METHOD, not the result. "Every dimension sits on the band
    // average" is true of the full library and false under a narrow filter,
    // where one Comedy watch draws a 100% column; a static sentence cannot make
    // a claim the rail is free to falsify.
    blurb:
      "Only watches at 3.5★ and 4★, so a dimension that merely predicts my rating cannot show up here as predicting the heart.",
    Chart: WhatMovesTheHeart,
  },
  {
    id: "admired",
    title: "Admired, not loved",
    blurb: "",
    Blurb: AdmiredNotLovedBlurb,
    Chart: AdmiredNotLoved,
  },
  {
    id: "over-time",
    title: "A habit of pressing it",
    blurb:
      "The heart is film-level on Letterboxd and stamps onto every entry for that film, so an early year reflects hearts given since as much as hearts given then.",
    Chart: AffectionOverTime,
  },
];

function Body() {
  const { filtered, all } = useExplorer();
  const known = filtered.filter((w) => w.liked != null);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: INK.primary }}>
          The heart
        </h1>
        <p className="mt-1 text-sm" style={{ color: INK.muted }}>
          Prototypes. {known.length} of {filtered.length} watches in view recorded a
          heart; the {all.length - all.filter((w) => w.liked != null).length}{" "}
          pre-Letterboxd rows never did and are excluded from every rate here.
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
      <div className="grid grid-cols-1 gap-12">
        {SECTIONS.map(({ id, title, blurb, Blurb, Chart }) => (
          <section key={id}>
            <h2 className="text-lg font-bold" style={{ color: INK.primary }}>
              {title}
            </h2>
            {Blurb ? (
              <div className="mt-1 mb-3">
                <Blurb />
              </div>
            ) : (
              blurb && (
                <p className="mt-1 mb-3 text-sm" style={{ color: INK.secondary }}>
                  {blurb}
                </p>
              )
            )}
            <Chart />
          </section>
        ))}

        <SelectionPanel />
      </div>
    </div>
  );
}

export function LikedLab({ data }: { data: Dataset }) {
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
