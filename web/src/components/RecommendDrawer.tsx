"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRecommend } from "@/lib/recommendStore";
import { useExplorer } from "@/lib/store";
import {
  loadEmbeddings,
  topNSimilar,
  filterRecommendations,
  scoreWithPrior,
  tasteVector,
  type Recommendation,
  type CandidateMetadata,
} from "@/lib/recommend";
import type { Filters } from "@/lib/store";
import {
  contrastiveExplain,
  type ExplainContext,
  type Reason,
} from "@/lib/explainClient";
import { criticPrior } from "@/lib/recommend";
import { FilmCard } from "./FilmCard";
import { hairline, useTheme } from "@/lib/theme";

import embeddingsVersion from "../../public/data/embeddings-version.json";

type EvalData = {
  pool_size: number;
  balanced_liked?: { median_rank: number | null; hit_100: number | null };
  cosine_liked?: { median_rank: number | null; hit_100: number | null };
  random_liked?: { median_rank: number | null; hit_100: number | null };
  imdb_liked?: { median_rank: number | null; hit_100: number | null };
};

let _evalCache: EvalData | null | false = null;
async function loadEval(): Promise<EvalData | null> {
  if (_evalCache !== null) return _evalCache || null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/recs-eval.json`);
    if (!res.ok) { _evalCache = false; return null; }
    _evalCache = await res.json();
    return _evalCache || null;
  } catch { _evalCache = false; return null; }
}

const R2_URL = process.env.NEXT_PUBLIC_R2_URL || "";

function matchesDashboardFilters(meta: CandidateMetadata, dashFilters: Filters): boolean {
  const genres = meta.genres ? meta.genres.split(", ").map((g) => g.trim()) : [];
  if (dashFilters.genres.size > 0 && !genres.some((g) => dashFilters.genres.has(g as never))) return false;
  if (dashFilters.director && !(meta.director ?? "").toLowerCase().includes(dashFilters.director.toLowerCase())) return false;
  if (dashFilters.actor && !(meta.actors ?? "").toLowerCase().includes(dashFilters.actor.toLowerCase())) return false;
  if (dashFilters.releaseYearRange) {
    const y = meta.year;
    if (y == null || y < dashFilters.releaseYearRange[0] || y > dashFilters.releaseYearRange[1]) return false;
  }
  if (dashFilters.country && !(meta.production_countries || "").split(", ").includes(dashFilters.country)) return false;
  if (dashFilters.language && meta.language !== dashFilters.language) return false;
  if (dashFilters.rated && meta.rated !== dashFilters.rated) return false;
  if (dashFilters.runtimeRange) {
    const rt = meta.runtime;
    if (rt == null || rt < dashFilters.runtimeRange[0] || rt > dashFilters.runtimeRange[1])
      return false;
  }
  // franchise and my-rating aren't in the candidate metadata, so they can't
  // boost recommendations.
  return true;
}

function hasDashboardFilters(f: Filters): boolean {
  return (
    f.genres.size > 0 ||
    !!f.director ||
    !!f.actor ||
    !!f.country ||
    !!f.language ||
    !!f.rated ||
    f.releaseYearRange !== null ||
    f.runtimeRange !== null
  );
}

export function weightedSample(pool: Recommendation[], n: number): Recommendation[] {
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  const topSlice = sorted.slice(0, Math.max(n * 5, 50));
  const remaining = [...topSlice];
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
  state: { mode: string; sourceTmdbId: number | null; filters: Record<string, unknown>; genre: string | null; hideRated: boolean; lambda: number },
  ratedIds: Set<number>,
  films: Map<number, { tmdb_id: number; genres: string[]; director: string | null; actors: string | null; keywords: string[] }>,
  watches: { tmdb_id: number; rating: number | null }[],
  dashFilters: Filters,
): Promise<{ recs: Recommendation[]; reasons: Record<number, Reason[]>; boostCount: number }> {
  if (!R2_URL) return { recs: [], reasons: {}, boostCount: 0 };
  const { data } = await loadEmbeddings(R2_URL, embeddingsVersion.version);
  const TARGET = 10;
  let finalRecs: Recommendation[] = [];
  let boostCount = 0;
  const taste = tasteVector(data, watches);

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
    const excludeIds = state.hideRated ? ratedIds : new Set<number>();
    // Score candidates against the user's taste vector (rating-weighted mean of
    // their rated films' embeddings) so "recommended for you" is earned, not
    // random. weightedSample keeps variety; the scores steer it.
    let pool: Recommendation[] = taste
      ? scoreWithPrior(taste, data, excludeIds, state.lambda)
      : Object.keys(data.vectors)
          .map(Number)
          .filter((id) => !excludeIds.has(id) && data.metadata[id])
          .map((id) => ({ tmdb_id: id, score: 0, metadata: data.metadata[id] }));
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

  const metas = Object.values(data.metadata);
  let priorSum = 0, priorN = 0;
  for (const m of metas) {
    const p = criticPrior(m, NaN);
    if (!isNaN(p)) { priorSum += p; priorN++; }
  }
  const poolMean = priorN > 0 ? priorSum / priorN : 0.5;
  const explainCtx: ExplainContext | null = taste && data.featureNames ? {
    taste,
    featureNames: data.featureNames,
    watches: watches.filter((w) => w.rating != null) as { tmdb_id: number; rating: number }[],
    vectors: data.vectors,
    metadata: data.metadata,
    lambda: state.lambda,
    poolMean,
  } : null;
  const reasons: Record<number, Reason[]> = {};
  for (const r of finalRecs) {
    const vec = data.vectors[r.tmdb_id];
    reasons[r.tmdb_id] = explainCtx && vec
      ? contrastiveExplain(vec, r.metadata, explainCtx)
      : [];
  }

  return { recs: finalRecs, reasons, boostCount };
}

function CredibilityPanel({ tokens }: { tokens: ReturnType<typeof useTheme>["tokens"] }) {
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadEval().then(setEvalData); }, []);
  if (!evalData) return null;

  const rows = [
    { label: "Balanced (λ=0.5)", data: evalData.balanced_liked },
    { label: "Cosine only", data: evalData.cosine_liked },
    { label: "IMDb rating", data: evalData.imdb_liked },
    { label: "Random", data: evalData.random_liked },
  ].filter((r) => r.data?.median_rank != null);

  return (
    <details
      className="mt-4 border-t pt-3"
      style={{ borderColor: hairline(tokens.ink.primary, 12) }}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.15em]"
        style={{ color: tokens.ink.muted }}
      >
        How good is this?
      </summary>
      <div className="mt-2">
        <table className="w-full text-[11px]" style={{ color: tokens.ink.secondary }}>
          <thead>
            <tr>
              <th className="text-left font-medium pb-1">Ranker</th>
              <th className="text-right font-medium pb-1">Median rank</th>
              <th className="text-right font-medium pb-1">Hit@100</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-0.5">{r.label}</td>
                <td className="text-right py-0.5">{r.data!.median_rank?.toLocaleString()}</td>
                <td className="text-right py-0.5">
                  {r.data!.hit_100 != null ? `${Math.round(r.data!.hit_100 * 100)}%` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: tokens.ink.muted }}>
          Content features alone explain little of the variance in my ratings (R&sup2;&nbsp;0.04 vs
          0.21 for critic scores). The held-out numbers above show how often a liked film lands in
          the top 100 of a {evalData.pool_size?.toLocaleString()}-film pool.
        </p>
      </div>
    </details>
  );
}

type Status = "loading" | "ready" | "error";

export function RecommendDrawer() {
  const { state, dispatch } = useRecommend();
  const { byId, all, filters: dashFilters, watchlist } = useExplorer();
  const { tokens } = useTheme();

  // Films the reader has already shortlisted. A recommendation that lands on one
  // is the recommender agreeing with a decision already made, which is worth
  // saying: without the badge it reads as a film they have never considered.
  const watchlistIds = useMemo(
    () => new Set(watchlist.map((f) => f.tmdb_id)),
    [watchlist],
  );
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [reasonsMap, setReasonsMap] = useState<Record<number, Reason[]>>({});
  const [boostCount, setBoostCount] = useState(0);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [status, setStatus] = useState<Status>("loading");

  const ratedIds = useMemo(() => new Set(all.map((w) => w.tmdb_id)), [all]);

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state.open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE" });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [state.open, dispatch]);

  // Recommendations depend on every dashboard filter EXCEPT the brush selection,
  // which fetchRecs never reads. Memoize on the rec-relevant fields so brushing
  // (selection only) does not re-run the fetch or flash the skeleton.
  const {
    genres, country, language, rated, franchise, rewatch, title, director, actor,
    yearRange, releaseYearRange, runtimeRange, ratingRange, votesRange, genreTag, keyword,
  } = dashFilters;
  const recFilters = useMemo<Filters>(
    () => ({
      genres,
      yearRange,
      releaseYearRange,
      rewatch,
      title,
      director,
      actor,
      country,
      language,
      rated,
      franchise,
      runtimeRange,
      ratingRange,
      votesRange,
      genreTag,
      keyword,
      selection: null,
    }),
    [genres, country, language, rated, franchise, rewatch, title, director, actor, yearRange, releaseYearRange, runtimeRange, ratingRange, votesRange, genreTag, keyword],
  );

  useEffect(() => {
    // No backing store configured → handled as "unavailable" at render time.
    if (!state.open || !R2_URL) return;
    let canceled = false;
    const watches = all.map((w) => ({ tmdb_id: w.tmdb_id, rating: w.rating }));
    fetchRecs(state, ratedIds, byId as never, watches, recFilters)
      .then((result) => {
        if (canceled) return;
        setRecs(result.recs);
        setReasonsMap(result.reasons);
        setBoostCount(result.boostCount);
        setStatus("ready");
      })
      .catch(() => {
        if (!canceled) {
          setRecs([]);
          setStatus("error");
        }
      });
    return () => {
      canceled = true;
    };
  }, [state, shuffleCount, ratedIds, all, byId, recFilters]);

  // Reset to the loading state whenever a new request is kicked off, so the
  // skeleton shows instead of stale results. Done outside the effect to satisfy
  // the react-hooks set-state-in-effect rule. Selection is excluded here too, so
  // a brush never flashes the skeleton.
  const [reqKey, setReqKey] = useState("");
  const dashSig = [
    [...genres].sort().join(","),
    country,
    language,
    rated,
    franchise,
    rewatch,
    title,
    director,
    actor,
    yearRange?.join("-") ?? "",
    releaseYearRange?.join("-") ?? "",
    runtimeRange?.join("-") ?? "",
    ratingRange?.join("-") ?? "",
  ].join("|");
  const currentKey = `${state.mode}:${state.sourceTmdbId}:${state.genre}:${state.filters.language}:${state.lambda}:${shuffleCount}:${dashSig}`;
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
        : "Recommended for me";

  const langActive = state.filters.language != null;
  const pill = (active: boolean) => ({
    background: active ? tokens.ui.active : "transparent",
    color: active ? tokens.ui.activeText : tokens.ink.secondary,
    borderColor: active
      ? tokens.ui.active
      : hairline(tokens.ink.primary, 20),
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 md:bg-black/10"
        onClick={() => dispatch({ type: "CLOSE" })}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={headerText}
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl
          border-t transition-transform duration-300
          md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[360px]
          md:rounded-none md:border-l md:border-t-0"
        style={{ background: tokens.ink.surface, borderColor: tokens.accent }}
      >
        <div className="flex justify-center pt-2 md:hidden">
          <div
            className="h-1 w-8 rounded-full"
            style={{ background: hairline(tokens.ink.primary, 20) }}
          />
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: tokens.accent }}
            >
              {headerText}
            </span>
            <button
              ref={closeRef}
              onClick={() => dispatch({ type: "CLOSE" })}
              className="text-lg leading-none"
              style={{ color: tokens.ink.muted }}
              aria-label="Close recommendations"
            >
              ✕
            </button>
          </div>

          <p className="mb-3 text-[11px]" style={{ color: tokens.ink.muted }}>
            Based on my ratings and taste.
          </p>

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

          <div
            className="mb-3 flex rounded-lg border overflow-hidden"
            style={{ borderColor: hairline(tokens.ink.primary, 20) }}
            role="group"
            aria-label="Critic influence"
          >
            {([
              { label: "Deep cuts", value: 0 },
              { label: "Balanced", value: 0.5 },
              { label: "Safe picks", value: 1 },
            ] as const).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => dispatch({ type: "SET_LAMBDA", lambda: value })}
                className="flex-1 px-2 py-1 text-[10px] font-medium"
                style={{
                  background: state.lambda === value ? tokens.ui.active : "transparent",
                  color: state.lambda === value ? tokens.ui.activeText : tokens.ink.secondary,
                }}
                aria-pressed={state.lambda === value}
              >
                {label}
              </button>
            ))}
          </div>

          {effectiveStatus === "loading" && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg"
                  style={{ background: hairline(tokens.ink.primary, 5) }}
                />
              ))}
              <p className="mt-1 text-xs" style={{ color: tokens.ink.muted }}>
                Finding films like these…
              </p>
            </div>
          )}

          {effectiveStatus === "error" && (
            <p className="text-sm" style={{ color: tokens.ink.secondary }}>
              Recommendations are unavailable right now. The model that powers them
              couldn&rsquo;t load. Try again in a moment.
            </p>
          )}

          {effectiveStatus === "ready" && recs.length === 0 && (
            <div className="text-sm" style={{ color: tokens.ink.secondary }}>
              <p>No films match these filters.</p>
              {langActive && (
                <button
                  onClick={() => dispatch({ type: "SET_LANGUAGE", language: undefined })}
                  className="mt-1 underline underline-offset-2"
                  style={{ color: tokens.accent }}
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
                      <div
                        className="flex-1 border-t"
                        style={{ borderColor: hairline(tokens.ink.primary, 12) }}
                      />
                      <span
                        className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.15em]"
                        style={{ color: tokens.ink.muted }}
                      >
                        you might also like
                      </span>
                      <div
                        className="flex-1 border-t"
                        style={{ borderColor: hairline(tokens.ink.primary, 12) }}
                      />
                    </div>
                  )}
                  <div className="min-w-[200px] md:min-w-0">
                    <FilmCard
                      metadata={r.metadata}
                      score={r.score}
                      reasons={reasonsMap[r.tmdb_id] ?? []}
                      onWatchlist={watchlistIds.has(r.tmdb_id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <CredibilityPanel tokens={tokens} />
        </div>
      </aside>
    </>
  );
}
