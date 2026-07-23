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
import { ACCENT, INK } from "@/lib/palette";

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

type Status = "loading" | "ready" | "error";

export function RecommendDrawer() {
  const { state, dispatch } = useRecommend();
  const { byId, all, filters: dashFilters } = useExplorer();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [reasonsMap, setReasonsMap] = useState<Record<number, Reason[]>>({});
  const [boostCount, setBoostCount] = useState(0);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [status, setStatus] = useState<Status>("loading");

  const ratedIds = useMemo(() => new Set(all.map((w) => w.tmdb_id)), [all]);

  useEffect(() => {
    // No backing store configured → handled as "unavailable" at render time.
    if (!state.open || !R2_URL) return;
    let cancelled = false;
    const watches = all.map((w) => ({ tmdb_id: w.tmdb_id, rating: w.rating }));
    fetchRecs(state, ratedIds, byId as never, watches, dashFilters)
      .then((result) => {
        if (cancelled) return;
        setRecs(result.recs);
        setReasonsMap(result.reasons);
        setBoostCount(result.boostCount);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setRecs([]);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state, shuffleCount, ratedIds, all, byId, dashFilters]);

  // Reset to the loading state whenever a new request is kicked off, so the
  // skeleton shows instead of stale results. Done outside the effect to satisfy
  // the react-hooks set-state-in-effect rule.
  const [reqKey, setReqKey] = useState("");
  const currentKey = `${state.mode}:${state.sourceTmdbId}:${state.genre}:${state.filters.language}:${shuffleCount}`;
  if (state.open && R2_URL && currentKey !== reqKey) {
    setReqKey(currentKey);
    setStatus("loading");
  }

  if (!state.open) return null;

  const effectiveStatus: Status = R2_URL ? status : "error";

  const sourceFilm = state.sourceTmdbId ? byId.get(state.sourceTmdbId) : null;

  const headerText =
    state.mode === "similar" && sourceFilm
      ? `More like ${sourceFilm.title}`
      : state.mode === "genre-recommend" && state.genre
        ? `Recommended · ${state.genre}`
        : "Recommended for you";

  const langActive = state.filters.language != null;
  const pill = (active: boolean) => ({
    background: active ? ACCENT : "transparent",
    color: active ? INK.surface : INK.secondary,
    borderColor: active ? ACCENT : "rgba(11,11,11,0.2)",
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 md:bg-black/10"
        onClick={() => dispatch({ type: "CLOSE" })}
        aria-hidden
      />

      <aside
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl
          border-t transition-transform duration-300
          md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[360px]
          md:rounded-none md:border-l md:border-t-0"
        style={{ background: INK.surface, borderColor: ACCENT }}
      >
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-8 rounded-full" style={{ background: "rgba(11,11,11,0.2)" }} />
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: ACCENT }}
            >
              {headerText}
            </span>
            <button
              onClick={() => dispatch({ type: "CLOSE" })}
              className="text-lg leading-none"
              style={{ color: INK.muted }}
              aria-label="Close recommendations"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={() =>
                dispatch({
                  type: "SET_LANGUAGE",
                  language: state.filters.language === "en" ? undefined : "en",
                })
              }
              className="rounded-full border px-2.5 py-0.5 text-[11px]"
              style={pill(state.filters.language === "en")}
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
              className="rounded-full border px-2.5 py-0.5 text-[11px]"
              style={pill(state.filters.language === "non-en")}
            >
              Non-EN
            </button>
            <button
              onClick={() => setShuffleCount((c) => c + 1)}
              className="rounded-full border px-2.5 py-0.5 text-[11px]"
              style={pill(false)}
            >
              Shuffle
            </button>
          </div>

          {effectiveStatus === "loading" && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg"
                  style={{ background: "rgba(11,11,11,0.05)" }}
                />
              ))}
              <p className="mt-1 text-xs" style={{ color: INK.muted }}>
                Finding films like these…
              </p>
            </div>
          )}

          {effectiveStatus === "error" && (
            <p className="text-sm" style={{ color: INK.secondary }}>
              Recommendations are unavailable right now. The model that powers them
              couldn&rsquo;t load — try again in a moment.
            </p>
          )}

          {effectiveStatus === "ready" && recs.length === 0 && (
            <div className="text-sm" style={{ color: INK.secondary }}>
              <p>No films match these filters.</p>
              {langActive && (
                <button
                  onClick={() => dispatch({ type: "SET_LANGUAGE", language: undefined })}
                  className="mt-1 underline underline-offset-2"
                  style={{ color: ACCENT }}
                >
                  clear the language filter
                </button>
              )}
            </div>
          )}

          {effectiveStatus === "ready" && recs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
              {recs.map((r, i) => (
                <div key={r.tmdb_id} className="contents">
                  {i === boostCount && boostCount > 0 && boostCount < recs.length && (
                    <div className="flex min-w-[200px] items-center gap-2 md:min-w-0 md:py-1">
                      <div className="flex-1 border-t" style={{ borderColor: "rgba(11,11,11,0.12)" }} />
                      <span
                        className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.15em]"
                        style={{ color: INK.muted }}
                      >
                        you might also like
                      </span>
                      <div className="flex-1 border-t" style={{ borderColor: "rgba(11,11,11,0.12)" }} />
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
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
