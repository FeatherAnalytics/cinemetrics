"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { INK, primaryGenre } from "@/lib/palette";
import { GENRE_ALPHA } from "@/lib/statsChart";
import {
  byRewatch,
  byRuntimeBand,
  CROSSOVER,
  crossoverWatches,
  likedRate,
  REWATCH_LABELS,
  RUNTIME_BANDS,
} from "@/lib/likedChart";
import type { EnrichedWatch } from "@/lib/types";
import { Toggle } from "@/components/stats/Toggle";
import { accentFor, isPicked, pickWatches } from "@/components/stats/pick";
import { RateBars, type RateBar } from "./RateBars";

const DIMENSIONS = ["genre", "runtime", "rewatch"] as const;
type Dimension = (typeof DIMENSIONS)[number];

/**
 * What predicts the heart, once the rating is held still.
 *
 * Restricted to the crossover band, and that restriction is the entire method.
 * Tested across the FULL rating scale, runtime looks like a strong predictor:
 * affection climbs from 30% under ninety minutes to 60% past two hours twenty.
 * It is not. Long films get higher ratings from me (65.3 average under ninety,
 * 80.9 past 140), and the affection is following the rating. Inside the band the
 * gradient is gone.
 *
 * So this panel is built to report a NULL result honestly. Every dimension
 * offered here is flat, and a reader has to be able to see that it is flat,
 * which is why the bars keep the fixed 0-100% scale instead of zooming to a
 * range where noise would look like structure.
 */
export function WhatMovesTheHeart() {
  const { filtered, filters, setSelection } = useExplorer();
  const [dim, setDim] = useState<Dimension>("genre");

  /**
   * Genre drops out of the toggle when the rail has already picked one.
   *
   * Filtered to Horror, grouping by genre draws a single column called Horror
   * and five empty slots: the filter read back rather than an answer. Ratings by
   * genre hit exactly this and solved it by switching to the second genre, which
   * works there because the chart IS about genre. Here genre is one candidate
   * predictor among three, so the honest move is to stop offering it.
   */
  const offered = useMemo<readonly Dimension[]>(() => {
    const band = crossoverWatches(filtered);
    const genres = new Set(band.map((w) => primaryGenre(w.film)));
    return genres.size >= 2 ? DIMENSIONS : DIMENSIONS.filter((o) => o !== "genre");
  }, [filtered]);

  const active: Dimension = offered.includes(dim) ? dim : offered[0];

  const model = useMemo(() => {
    const band = crossoverWatches(filtered);
    if (active === "runtime") {
      return {
        labels: RUNTIME_BANDS.map((b) => b.label),
        groups: byRuntimeBand(band),
      };
    }
    if (active === "rewatch") {
      return { labels: [...REWATCH_LABELS], groups: byRewatch(band) };
    }
    const byGenre = new Map<string, EnrichedWatch[]>();
    for (const w of band) {
      const g = primaryGenre(w.film);
      const bucket = byGenre.get(g);
      if (bucket) bucket.push(w);
      else byGenre.set(g, [w]);
    }
    return {
      labels: [...GENRE_ALPHA],
      groups: GENRE_ALPHA.map((g) => byGenre.get(g) ?? []),
    };
  }, [filtered, active]);

  const bars: RateBar[] = model.groups.map((ws, i) => {
    const r = likedRate(ws);
    return { label: model.labels[i], rate: r.rate, n: r.n };
  });

  const activeIndex = model.groups.findIndex((ws) => isPicked(ws, filters.selection));
  const bandRate = likedRate(crossoverWatches(filtered));

  if (bandRate.n === 0) {
    return (
      <p className="text-sm" style={{ color: INK.muted }}>
        No watches rated {CROSSOVER[0]} to {CROSSOVER[1]} under this filter.
      </p>
    );
  }

  return (
    <div>
      {/* One option left is not a choice, so the switcher goes away rather than
          sitting there as a control that cannot do anything. */}
      {offered.length > 1 && (
        <div className="mb-2">
          <Toggle options={offered} value={active} onChange={setDim} label="Dimension" />
        </div>
      )}
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        hearted, rated {CROSSOVER[0]}-{CROSSOVER[1]} only
      </div>
      <RateBars
        bars={bars}
        accent={accentFor(filters.genres)}
        active={activeIndex >= 0 ? activeIndex : null}
        onPick={(i) => pickWatches(model.groups[i], filters.selection, setSelection)}
        refAt={bandRate.rate}
        refLabel={`band average ${Math.round(bandRate.rate * 100)}%`}
      />
    </div>
  );
}
