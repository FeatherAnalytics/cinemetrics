"use client";

import { useEffect, useMemo, useState } from "react";
import { useRecommend } from "@/lib/recommendStore";
import { useExplorer } from "@/lib/store";
import {
  loadEmbeddings,
  topNSimilar,
  filterRecommendations,
  type Recommendation,
  type CandidateMetadata,
} from "@/lib/recommend";
import type { Filters } from "@/lib/store";
import {
  explainRecommendation,
  computeGenreAffinities,
  type Reason,
} from "@/lib/explainClient";
import { FilmCard } from "./FilmCard";

const R2_URL = process.env.NEXT_PUBLIC_R2_URL || "";

function matchesDashboardFilters(meta: CandidateMetadata, dashFilters: Filters): boolean {
  const genres = meta.genres ? meta.genres.split(", ").map((g) => g.trim()) : [];
  if (dashFilters.genres.size > 0 && !genres.some((g) => dashFilters.genres.has(g as never))) return false;
  if (dashFilters.director && !(meta.director || "").toLowerCase().includes(dashFilters.director.toLowerCase())) return false;
  if (dashFilters.actor && !(meta.actors || "").toLowerCase().includes(dashFilters.actor.toLowerCase())) return false;
  if (dashFilters.releaseYearRange) {
    const y = meta.year;
    if (y == null || y < dashFilters.releaseYearRange[0] || y > dashFilters.releaseYearRange[1]) return false;
  }
  if (dashFilters.country && !(meta.production_countries || "").split(", ").includes(dashFilters.country)) return false;
  return true;
}

function hasDashboardFilters(f: Filters): boolean {
  return f.genres.size > 0 || !!f.director || !!f.actor || !!f.country || f.releaseYearRange !== null;
}

function weightedSample(pool: Recommendation[], n: number): Recommendation[] {
  const remaining = [...pool];
  const picked: Recommendation[] = [];
  while (picked.length < n && remaining.length > 0) {
    const weights = remaining.map((r) => Math.max(r.score, 0.01));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < remaining.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        picked.push(remaining[i]);
        remaining.splice(i, 1);
        break;
      }
    }
  }
  return picked.sort((a, b) => b.score - a.score);
}

async function fetchRecs(
  state: { mode: string; sourceTmdbId: number | null; filters: Record<string, unknown>; genre: string | null; hideRated: boolean },
  ratedIds: Set<number>,
  films: Map<number, { tmdb_id: number; genres: string[]; director: string | null; actors: string | null; keywords: string[] }>,
  watches: { tmdb_id: number; rating: number | null }[],
  dashFilters: Filters,
): Promise<{ recs: Recommendation[]; reasons: Record<number, Reason[]>; boostCount: number }> {
  if (!R2_URL) return { recs: [], reasons: {}, boostCount: 0 };
  const { data } = await loadEmbeddings(R2_URL);
  const TARGET = 10;
  let finalRecs: Recommendation[] = [];
  let boostCount = 0;

  if (state.mode === "similar" && state.sourceTmdbId) {
    const excludeIds = state.hideRated
      ? new Set([...ratedIds, state.sourceTmdbId])
      : new Set([state.sourceTmdbId]);
    let results = topNSimilar(state.sourceTmdbId, data, 20, excludeIds);
    results = filterRecommendations(results, {
      ...state.filters,
    } as { language?: "en" | "non-en"; genre?: string });
    finalRecs = results.slice(0, TARGET);
  } else {
    const allIds = Object.keys(data.vectors).map(Number);
    const excludeIds = state.hideRated ? ratedIds : new Set<number>();
    let pool: Recommendation[] = [];
    for (const id of allIds) {
      if (excludeIds.has(id)) continue;
      const meta = data.metadata[id];
      if (!meta) continue;
      pool.push({ tmdb_id: id, score: 0, metadata: meta });
    }
    pool = filterRecommendations(pool, {
      ...state.filters,
      genre: state.mode === "genre-recommend" ? (state.genre ?? undefined) : undefined,
    } as { language?: "en" | "non-en"; genre?: string });

    if (hasDashboardFilters(dashFilters)) {
      const boosted = pool.filter((r) => matchesDashboardFilters(r.metadata, dashFilters));
      const rest = pool.filter((r) => !matchesDashboardFilters(r.metadata, dashFilters));
      const boostedPicks = weightedSample(boosted, TARGET);
      boostCount = boostedPicks.length;
      const remaining = TARGET - boostedPicks.length;
      const fillPicks = remaining > 0 ? weightedSample(rest, remaining) : [];
      finalRecs = [...boostedPicks, ...fillPicks];
    } else {
      finalRecs = weightedSample(pool, TARGET);
    }
  }

  const genreAffinities = computeGenreAffinities([...films.values()] as never[], watches);
  const sourceData = state.sourceTmdbId ? data.metadata[state.sourceTmdbId] ?? undefined : undefined;
  const reasons: Record<number, Reason[]> = {};
  for (const r of finalRecs) {
    reasons[r.tmdb_id] = explainRecommendation(sourceData, r.metadata, genreAffinities);
  }

  return { recs: finalRecs, reasons, boostCount };
}

export function RecommendDrawer() {
  const { state, dispatch } = useRecommend();
  const { byId, all, filters: dashFilters } = useExplorer();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [reasonsMap, setReasonsMap] = useState<Record<number, Reason[]>>({});
  const [boostCount, setBoostCount] = useState(0);
  const [shuffleCount, setShuffleCount] = useState(0);

  const ratedIds = useMemo(() => new Set(all.map((w) => w.tmdb_id)), [all]);

  useEffect(() => {
    if (!state.open) return;
    let cancelled = false;
    const watches = all.map((w) => ({ tmdb_id: w.tmdb_id, rating: w.rating }));
    fetchRecs(state, ratedIds, byId as never, watches, dashFilters).then((result) => {
      if (cancelled) return;
      setRecs(result.recs);
      setReasonsMap(result.reasons);
      setBoostCount(result.boostCount);
    }).catch(() => {
      if (!cancelled) setRecs([]);
    });
    return () => { cancelled = true; };
  }, [state, shuffleCount, ratedIds, all, byId, dashFilters]);

  if (!state.open) return null;

  const sourceFilm = state.sourceTmdbId ? byId.get(state.sourceTmdbId) : null;

  const headerText =
    state.mode === "similar" && sourceFilm
      ? `More like ${sourceFilm.title}`
      : state.mode === "genre-recommend" && state.genre
        ? `Recommended: ${state.genre}`
        : "Recommended for you";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 md:bg-black/10"
        onClick={() => dispatch({ type: "CLOSE" })}
        aria-hidden
      />

      <aside
        className="fixed z-50 overflow-y-auto transition-transform duration-300
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[60vh]
          md:bottom-auto md:top-0 md:left-auto md:right-0 md:w-[350px] md:h-full md:rounded-none md:max-h-none
          md:border-l"
        style={{ background: "#1e293b", borderColor: "#7b2cbf" }}
      >
        <div className="flex justify-center pt-2 md:hidden">
          <div className="w-8 h-1 rounded-full" style={{ background: "#444" }} />
        </div>

        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold" style={{ color: "#c084fc" }}>
              {headerText}
            </span>
            <button
              onClick={() => dispatch({ type: "CLOSE" })}
              className="text-gray-400 hover:text-white text-lg leading-none"
              aria-label="Close recommendations"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() =>
                dispatch({
                  type: "SET_LANGUAGE",
                  language: state.filters.language === "en" ? undefined : "en",
                })
              }
              className="px-2 py-0.5 rounded-full text-[9px] border"
              style={{
                background: state.filters.language === "en" ? "#2a3a2a" : "transparent",
                color: state.filters.language === "en" ? "#86efac" : "#888",
                borderColor: state.filters.language === "en" ? "#2d6b45" : "#444",
              }}
            >
              EN
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "SET_LANGUAGE",
                  language: state.filters.language === "non-en" ? undefined : "non-en",
                })
              }
              className="px-2 py-0.5 rounded-full text-[9px] border"
              style={{
                background: state.filters.language === "non-en" ? "#2a2a3a" : "transparent",
                color: state.filters.language === "non-en" ? "#fbbf24" : "#888",
                borderColor: state.filters.language === "non-en" ? "#92400e" : "#444",
              }}
            >
              Non-EN
            </button>
            <button
              onClick={() => setShuffleCount((c) => c + 1)}
              className="px-2 py-0.5 rounded-full text-[9px] border"
              style={{ color: "#888", borderColor: "#444" }}
            >
              Shuffle
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {recs.map((r, i) => (
              <div key={r.tmdb_id} className="contents">
                {i === boostCount && boostCount > 0 && boostCount < recs.length && (
                  <div className="flex items-center gap-2 min-w-[200px] md:min-w-0 md:py-1">
                    <div className="flex-1 border-t" style={{ borderColor: "#3a3a5a" }} />
                    <span className="text-[8px] uppercase tracking-widest whitespace-nowrap" style={{ color: "#666" }}>
                      you might also like
                    </span>
                    <div className="flex-1 border-t" style={{ borderColor: "#3a3a5a" }} />
                  </div>
                )}
                <div className="min-w-[200px] md:min-w-0">
                  <FilmCard
                    metadata={r.metadata}
                    score={r.score}
                    reasons={reasonsMap[r.tmdb_id] ?? []}
                  />
                </div>
              </div>
            ))}
            {recs.length === 0 && (
              <p className="text-sm text-gray-500">No recommendations match current filters.</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
