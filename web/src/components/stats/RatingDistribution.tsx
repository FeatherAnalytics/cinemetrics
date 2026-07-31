"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { ratingsByStarBin, starLabel, STAR_BINS } from "@/lib/likedChart";
import { likedOnly } from "@/lib/heartLens";
import { CategoryBars } from "./CategoryBars";
import { accentFor, isPicked, pickWatches } from "./pick";

/**
 * How my ratings are distributed, one column per half star.
 *
 * The page's opening question, and the one every other chart is downstream of:
 * before "when do I watch" or "do I agree with the critics" means anything, a
 * reader needs the shape of the scale itself. It sits at the top of every set for
 * that reason, the landing page and each story alike.
 *
 * A wrapper rather than a chart. `CategoryBars` already draws vertical columns
 * against a median tick and cross-filters on click, so the only thing missing was
 * the binning, and that lives in `likedChart` where the half-star scale is
 * defined and tested.
 *
 * Counts EVERY rated watch, not just the ones with a recorded heart: see the note
 * on `ratingsByStarBin`.
 */
export function RatingDistribution() {
  const { filtered, filters, setSelection, heartLens } = useExplorer();
  const { tokens } = useTheme();
  const [hover, setHover] = useState<number | null>(null);

  // Under the heart lens this is the shape of the HEARTED scale, not the whole
  // one. The favorites story is about the films that got the heart, and a
  // full-library histogram sitting above five charts that are all about the
  // heart reads as though the story's subject were every watch.
  //
  // Not to be confused with `LikedByRating`, the heart set's own chart, which
  // needs both halves: it draws the hearted SHARE of each bin, and filtering its
  // input to the hearted would make every column 100%.
  const lensed = useMemo(
    () => (heartLens ? likedOnly(filtered) : filtered),
    [heartLens, filtered],
  );
  const groups = useMemo(() => ratingsByStarBin(lensed), [lensed]);
  // Memoised, not built inline: `CategoryBars` tweens these and compares the
  // array by identity, and this component re-renders on every hover.
  const bars = useMemo(
    () => groups.map((ws, i) => ({ label: starLabel(STAR_BINS[i]), value: ws.length })),
    [groups],
  );
  const total = groups.reduce((s, g) => s + g.length, 0);

  if (total === 0) {
    return (
      <p className="text-sm" style={{ color: tokens.ink.muted }}>
        Nothing in view is rated.
      </p>
    );
  }

  const activeIndex = groups.findIndex((ws) => isPicked(ws, filters.selection));
  const shown = hover != null ? groups[hover] : null;

  return (
    <div>
      {/* The readout gives the PROPORTION, never the count: the count is printed on
          the bar itself, and repeating it spends the one line the chart has on a
          number the reader is already looking at. The share is the part the bars
          cannot give, since the axis is absolute. */}
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: tokens.ink.muted }}
      >
        {shown && hover != null
          ? `${starLabel(STAR_BINS[hover])} · ${((shown.length / total) * 100).toFixed(1)}% of my ratings`
          : "watches"}
      </div>
      <CategoryBars
        bars={bars}
        accent={accentFor(filters.genres, tokens)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(groups[i], filters.selection, setSelection)}
        onHover={setHover}
        barLabel="value"
      />
      <div
        className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider"
        style={{ color: tokens.ink.muted }}
      >
        my rating
      </div>
    </div>
  );
}
