"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { GENRE_ALPHA } from "@/lib/statsChart";
import {
  categoryOf,
  DIMENSIONS as SERIES_DIMENSIONS,
  RUNTIME_ORDER,
  type Dimension as SeriesDimension,
} from "@/lib/series";
import { knownWatches, likedRate } from "@/lib/likedChart";
import type { EnrichedWatch } from "@/lib/types";
import { Toggle } from "@/components/stats/Toggle";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";
import { RateBars, type RateBar } from "./RateBars";

/**
 * The dimensions on offer, matching "Warming up or wearing out".
 *
 * Six of the seven come straight from `series.ts`, so the two charts split the
 * library the same way and a reader who has learned one axis has learned both.
 * That also means one definition of a runtime bucket and one of a decade rather
 * than a second set invented here; this chart previously carried its own runtime
 * cuts (<90 / 90-104 / …) against RollingRating's (<95 / 95-114 / …), which is
 * two answers to "is this a long film".
 *
 * MPAA is relabeled. `series.ts` calls it "rating", which is right on a page
 * where the only other rating is a star score in a different chart, and wrong
 * here, where the whole subject is my rating.
 *
 * Rewatch is the local addition. It is a property of the WATCH rather than the
 * film, so `categoryOf` cannot produce it.
 */
const MPAA_LABEL = "MPAA";
const REWATCH = "rewatch" as const;
type Dimension = SeriesDimension | typeof REWATCH;

const DIMENSIONS: { key: Dimension; label: string }[] = [
  ...SERIES_DIMENSIONS.map((d) => ({
    key: d.key as Dimension,
    label: d.key === "mpaa" ? MPAA_LABEL : d.label,
  })),
  { key: REWATCH, label: REWATCH },
];

// A category needs this many watches in the band to be worth a column. Below it
// the rate is arithmetic rather than evidence, and with the long tail of
// languages and countries the axis fills up with columns standing on one film.
const MIN_N = 3;
// Hard cap on columns. Country and language have long tails; past this the bars
// are too narrow to read and the chart stops being a comparison.
const MAX_CATS = 9;

/** Dimensions whose categories have a natural order that is not "by count". */
function orderedCategories(dim: Dimension, present: Set<string>): string[] | null {
  if (dim === "genre") return GENRE_ALPHA.filter((g) => present.has(g));
  if (dim === "runtime") return RUNTIME_ORDER.filter((b) => present.has(b));
  if (dim === "decade") {
    return [...present].sort((a, b) => parseInt(a) - parseInt(b));
  }
  if (dim === REWATCH) return ["first", "rewatch"].filter((k) => present.has(k));
  return null;
}

function bucketOf(w: EnrichedWatch, dim: Dimension): string | null {
  if (dim === REWATCH) return w.rewatch ? "rewatch" : "first";
  return categoryOf(w.film, dim);
}

/**
 * What predicts the heart, across every rating.
 *
 * Built to report a NULL result honestly, which is what it keeps finding: the bars
 * hold a fixed 0-100% scale instead of zooming to a range where noise would look
 * like structure, and thin categories are dropped rather than drawn.
 *
 * Read the runtime view with care. Affection climbs from 30% under ninety minutes
 * to 60% past two hours twenty, and that gradient is mostly the RATING: long films
 * score higher from me and the heart follows the score. This chart no longer holds
 * the rating still, so a gradient here is not evidence that the dimension moves the
 * heart on its own.
 */
export function WhatMovesTheHeart() {
  const { filtered, filters, setSelection } = useExplorer();
  const [dim, setDim] = useState<Dimension>("genre");

  // EVERY watch with a recorded heart, not just the crossover band. Restricting to
  // 3.5 and 4 stars held the rating still, which is the cleaner experiment, and it
  // also answered a question narrower than the one a reader arrives with: they want
  // to know what I heart, not what I heart within one slice of my own scale.
  const band = useMemo(() => knownWatches(filtered), [filtered]);

  /**
   * A dimension is offered only if it can actually draw a comparison.
   *
   * Filtered to Horror, grouping by genre draws a single column called Horror:
   * the filter read back rather than an answer. The same happens to language on
   * an English-only filter and to decade on a single year. Fewer than two
   * populated categories means there is nothing to compare, so the option goes
   * rather than sitting there resolving to a one-bar chart.
   */
  const offered = useMemo(() => {
    const counts = new Map<Dimension, Set<string>>();
    for (const d of DIMENSIONS) counts.set(d.key, new Set());
    for (const w of band) {
      for (const d of DIMENSIONS) {
        const c = bucketOf(w, d.key);
        if (c != null) counts.get(d.key)!.add(c);
      }
    }
    return DIMENSIONS.filter((d) => (counts.get(d.key)?.size ?? 0) >= 2);
  }, [band]);

  const active: Dimension =
    offered.some((d) => d.key === dim) ? dim : (offered[0]?.key ?? "genre");

  const model = useMemo(() => {
    const byCat = new Map<string, EnrichedWatch[]>();
    for (const w of band) {
      const c = bucketOf(w, active);
      if (c == null) continue;
      const bucket = byCat.get(c);
      if (bucket) bucket.push(w);
      else byCat.set(c, [w]);
    }

    const big = new Map([...byCat].filter(([, ws]) => ws.length >= MIN_N));
    const natural = orderedCategories(active, new Set(big.keys()));
    // Ordered dimensions keep their order; everything else ranks by count, the
    // same rule RollingRating uses to pick which categories earn a hue.
    const ranked =
      natural ?? [...big].sort((a, b) => b[1].length - a[1].length).map(([c]) => c);
    const shown = ranked.slice(0, MAX_CATS);

    return {
      labels: shown,
      groups: shown.map((c) => big.get(c) ?? []),
      dropped: byCat.size - shown.length,
    };
  }, [band, active]);

  const bars: RateBar[] = model.groups.map((ws, i) => {
    const r = likedRate(ws);
    return { label: model.labels[i], liked: r.liked, n: r.n };
  });

  const activeIndex = model.groups.findIndex((ws) => isPicked(ws, filters.selection));
  const bandRate = likedRate(band);

  if (bandRate.n === 0) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        Nothing in view recorded a heart.
      </p>
    );
  }

  return (
    <div>
      {/* The switcher renders even when THIS dimension has nothing to draw. It
          used to sit below an early return, so a dimension that came up empty
          took the control away with it and the reader was stuck on the one view
          that had no data. One option left is still no choice, so that case
          drops the control as before. */}
      {offered.length > 1 && (
        <div className="mb-2">
          <Toggle
            options={offered.map((d) => d.label)}
            value={offered.find((d) => d.key === active)?.label ?? ""}
            onChange={(label) => {
              const found = offered.find((d) => d.label === label);
              if (found) setDim(found.key);
            }}
            label="Dimension"
          />
        </div>
      )}

      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: INK.muted }}>
          No category here has {MIN_N} watches with a recorded heart.
        </p>
      ) : (
        <>
          <RateBars
            bars={bars}
            accent={accentFor(filters.genres)}
            active={activeIndex >= 0 ? activeIndex : null}
            onPick={(i) => pickWatches(model.groups[i], filters.selection, setSelection)}
            refAt={bandRate.rate}
            refLabel={`my rate ${Math.round(bandRate.rate * 100)}%`}
          />
          {/* Says what is missing rather than letting the axis imply the
              dimension has only these categories. */}
          {model.dropped > 0 && (
            <p className="mt-1 text-xs" style={{ color: INK.muted }}>
              {model.dropped} smaller {model.dropped === 1 ? "category" : "categories"} not
              shown.
            </p>
          )}
        </>
      )}
    </div>
  );
}
