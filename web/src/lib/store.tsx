"use client";

import {
  createContext,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { encodeUrlState, parseUrlState } from "./urlState";
import type { Dataset, EnrichedWatch, Film } from "./types";
import { primaryGenre, type GenreKey } from "./palette";
import { countryName } from "./countries";
import { watchKey } from "./brush";
import { STORIES, computeStoryHeadlines, type StoryResult, type ChartId } from "./stories";

function yearFrac(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return (d.getTime() - start) / (end - start);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export type TextField = "title" | "director" | "actor";

/** Pure filtering logic, extracted for testability. */
export function filterWatches(
  all: EnrichedWatch[],
  filters: Filters,
): EnrichedWatch[] {
  return all.filter((w) => {
    const f = w.film;
    if (filters.genres.size > 0 && !filters.genres.has(primaryGenre(f))) return false;
    if (filters.yearRange) {
      const y = w.d.getUTCFullYear();
      if (y < filters.yearRange[0] || y > filters.yearRange[1]) return false;
    }
    if (filters.releaseYearRange) {
      const y = f?.year;
      if (y == null || y < filters.releaseYearRange[0] || y > filters.releaseYearRange[1])
        return false;
    }
    if (filters.rewatch === "first" && w.rewatch) return false;
    if (filters.rewatch === "rewatch" && !w.rewatch) return false;
    if (filters.title && !(f?.title ?? "").toLowerCase().includes(filters.title.toLowerCase()))
      return false;
    if (
      filters.director &&
      !(f?.director ?? "").toLowerCase().includes(filters.director.toLowerCase())
    )
      return false;
    if (filters.actor && !(f?.actors ?? "").toLowerCase().includes(filters.actor.toLowerCase()))
      return false;
    if (filters.country && !(f?.production_countries ?? []).includes(filters.country))
      return false;
    if (filters.language && f?.language !== filters.language) return false;
    if (filters.rated && f?.rated !== filters.rated) return false;
    if (filters.franchise && f?.collection !== filters.franchise) return false;
    if (filters.runtimeRange) {
      const rt = f?.runtime;
      if (rt == null || rt < filters.runtimeRange[0] || rt > filters.runtimeRange[1])
        return false;
    }
    if (filters.ratingRange) {
      const r = w.rating;
      if (r == null || r < filters.ratingRange[0] || r > filters.ratingRange[1]) return false;
    }
    if (filters.selection && !filters.selection.has(watchKey(w))) return false;
    return true;
  });
}

export function getStoryById(id: string) {
  return STORIES.find((s) => s.id === id);
}

export type Filters = {
  genres: Set<GenreKey>; // empty = all genres
  yearRange: [number, number] | null; // watch-year inclusive range
  releaseYearRange: [number, number] | null; // film release-year inclusive range
  rewatch: "all" | "first" | "rewatch";
  title: string; // substring match on film title ("" = all)
  director: string; // substring match on director ("" = all)
  actor: string; // substring match on actors ("" = all)
  country: string | null; // production-country ISO code, set by the globe (null = all)
  language: string | null; // TMDB original_language ISO 639-1 code (null = all)
  rated: string | null; // MPAA content rating (null = all)
  franchise: string | null; // collection/franchise name (null = all)
  runtimeRange: [number, number] | null; // film runtime in minutes, inclusive
  ratingRange: [number, number] | null; // my rating 0-100, inclusive (drops unrated)
  selection: Set<string> | null; // brushed watch keys (null = no brush active)
};

const EMPTY_FILTERS: Filters = {
  genres: new Set(),
  yearRange: null,
  releaseYearRange: null,
  rewatch: "all",
  title: "",
  director: "",
  actor: "",
  country: null,
  language: null,
  rated: null,
  franchise: null,
  runtimeRange: null,
  ratingRange: null,
  selection: null,
};

// MPAA ratings in seniority order; anything else (TV ratings, "Not Rated")
// sorts after these, alphabetically.
const RATED_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];

function sortRated(a: string, b: string): number {
  const ia = RATED_ORDER.indexOf(a);
  const ib = RATED_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

type ExplorerValue = {
  films: Film[];
  byId: Map<number, Film>;
  all: EnrichedWatch[];
  filtered: EnrichedWatch[];
  yearBounds: [number, number];
  releaseYearBounds: [number, number];
  runtimeBounds: [number, number];
  titleOptions: string[];
  directorOptions: string[];
  actorOptions: string[];
  countryOptions: { iso: string; name: string }[];
  languageOptions: { code: string; name: string }[];
  ratedOptions: string[];
  franchiseOptions: string[];
  filters: Filters;
  selectedId: number | null; // tmdb_id of film clicked in a chart, highlighted everywhere
  activeStory: string | null;
  storyResult: StoryResult | null;
  storyFocus: { primary: ChartId; emphasize: ChartId[]; dim: ChartId[] } | null;
  storyHeadlines: { id: string; label: string; headline: string; chip: string }[];
  setStory: (id: string | null) => void;
  rollingDimension: string | null;
  toggleGenre: (g: GenreKey) => void;
  setYearRange: (r: [number, number]) => void;
  setReleaseYearRange: (r: [number, number]) => void;
  setRuntimeRange: (r: [number, number]) => void;
  setRatingRange: (r: [number, number]) => void;
  setRewatch: (r: Filters["rewatch"]) => void;
  setText: (field: TextField, value: string) => void;
  setCountry: (iso: string | null) => void;
  setLanguage: (code: string | null) => void;
  setRated: (rated: string | null) => void;
  setFranchise: (name: string | null) => void;
  setSelected: (id: number | null) => void;
  setSelection: (keys: Set<string> | null) => void;
  reset: () => void;
};

const Ctx = createContext<ExplorerValue | null>(null);

export function ExplorerProvider({
  data,
  children,
}: {
  data: Dataset;
  children: ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeStory, setActiveStory] = useState<string | null>(null);
  const [storyResult, setStoryResult] = useState<StoryResult | null>(null);

  const derived = useMemo(() => {
    const byId = new Map(data.films.map((f) => [f.tmdb_id, f]));
    const all: EnrichedWatch[] = data.watches.map((w) => {
      const d = new Date(w.date + "T00:00:00Z");
      return { ...w, film: byId.get(w.tmdb_id), d, yearFrac: yearFrac(d) };
    });
    const watchYears = all.map((w) => w.d.getUTCFullYear());
    const releaseYears = data.films.map((f) => f.year).filter((y): y is number => y != null);
    const runtimes = data.films.map((f) => f.runtime).filter((r): r is number => r != null);
    // Rounded out to 5-minute marks so the slider ends land on clean values.
    const runtimeBounds: [number, number] = runtimes.length
      ? [Math.floor(Math.min(...runtimes) / 5) * 5, Math.ceil(Math.max(...runtimes) / 5) * 5]
      : [0, 300];
    // Autocomplete option lists (director/actors are comma-separated -> split).
    const directorOptions = uniqueSorted(
      data.films.flatMap((f) => (f.director ?? "").split(",")),
    );
    const actorOptions = uniqueSorted(data.films.flatMap((f) => (f.actors ?? "").split(",")));
    const isos = [...new Set(data.films.flatMap((f) => f.production_countries ?? []))];
    const countryOptions = isos
      .map((iso) => ({ iso, name: countryName(iso) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const languageOptions = [
      ...new Set(data.films.map((f) => f.language).filter((l): l is string => !!l)),
    ]
      .map((code) => ({ code, name: languageName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const ratedOptions = [
      ...new Set(data.films.map((f) => f.rated).filter((r): r is string => !!r)),
    ].sort(sortRated);
    const franchiseOptions = [
      ...new Set(data.films.map((f) => f.collection).filter((c): c is string => !!c)),
    ].sort((a, b) => a.localeCompare(b));
    return {
      films: data.films,
      byId,
      all,
      yearBounds: [Math.min(...watchYears), Math.max(...watchYears)] as [number, number],
      releaseYearBounds: [Math.min(...releaseYears), Math.max(...releaseYears)] as [number, number],
      runtimeBounds,
      titleOptions: uniqueSorted(data.films.map((f) => f.title)),
      directorOptions,
      actorOptions,
      countryOptions,
      languageOptions,
      ratedOptions,
      franchiseOptions,
    };
  }, [data]);

  const { all } = derived;

  // Filtering runs against a deferred copy of the filters so fast interactions
  // (typing in a search box) update the input immediately and let the chart
  // re-render happen at background priority.
  const deferredFilters = useDeferredValue(filters);
  const filtered = useMemo(
    () => filterWatches(all, deferredFilters),
    [all, deferredFilters],
  );

  // Story headlines are computed once from the full dataset — they are stable
  // invitations, not filtered views.
  const storyHeadlines = useMemo(
    () => computeStoryHeadlines(derived.films, derived.all),
    [derived.films, derived.all],
  );

  // --- URL sync: hydrate once from the query string, then mirror state back
  // into it (replaceState, debounced) so filtered views are shareable links.
  // Reading window.location must wait for the client (the page is prerendered
  // with default state), so this is a genuine external-system sync: the
  // one-time setState after mount is intentional.
  const hydrated = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect --
     one-time hydration from the query string after mount */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const bounds = {
      yearBounds: derived.yearBounds,
      releaseYearBounds: derived.releaseYearBounds,
      runtimeBounds: derived.runtimeBounds,
    };
    const parsed = parseUrlState(new URLSearchParams(window.location.search), bounds);
    if (parsed.story) {
      const story = getStoryById(parsed.story);
      if (!story) return;
      const result = story.compute(derived.films, derived.all);
      setActiveStory(parsed.story);
      setStoryResult(result);
      setFilters({ ...EMPTY_FILTERS, ...result.filters, selection: result.selection ?? null });
    } else if (Object.keys(parsed.filters).length > 0) {
      setFilters((f) => ({ ...f, ...parsed.filters }));
    }
  }, [derived]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      const qs = encodeUrlState(filters, activeStory, {
        yearBounds: derived.yearBounds,
        releaseYearBounds: derived.releaseYearBounds,
        runtimeBounds: derived.runtimeBounds,
      });
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", url);
    }, 250);
    return () => clearTimeout(t);
  }, [filters, activeStory, derived]);

  const setStory = (id: string | null) => {
    if (id == null) {
      setActiveStory(null);
      setStoryResult(null);
      setFilters(EMPTY_FILTERS);
      setSelectedId(null);
      return;
    }
    const story = getStoryById(id);
    if (!story) return;
    const result = story.compute(derived.films, derived.all);
    setActiveStory(id);
    setStoryResult(result);
    const newFilters: Filters = {
      ...EMPTY_FILTERS,
      ...result.filters,
      selection: result.selection ?? null,
    };
    setFilters(newFilters);
    setSelectedId(null);
  };

  // The context value is memoized so consumers only re-render when state that
  // feeds them actually changes, not on every provider render.
  const value: ExplorerValue = useMemo(
    () => ({
      ...derived,
      filtered,
      filters,
      selectedId,
      toggleGenre: (g) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => {
          const genres = new Set(f.genres);
          if (genres.has(g)) genres.delete(g);
          else genres.add(g);
          return { ...f, genres };
        });
      },
      setYearRange: (r) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, yearRange: r }));
      },
      setReleaseYearRange: (r) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, releaseYearRange: r }));
      },
      setRuntimeRange: (r) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, runtimeRange: r }));
      },
      setRatingRange: (r) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, ratingRange: r }));
      },
      setRewatch: (r) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, rewatch: r }));
      },
      setText: (field, value) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, [field]: value }));
      },
      setCountry: (iso) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, country: f.country === iso ? null : iso }));
      },
      setLanguage: (code) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, language: f.language === code ? null : code }));
      },
      setRated: (rated) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, rated: f.rated === rated ? null : rated }));
      },
      setFranchise: (name) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, franchise: f.franchise === name ? null : name }));
      },
      setSelected: (id) => setSelectedId((cur) => (cur === id ? null : id)),
      setSelection: (keys) => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters((f) => ({ ...f, selection: keys && keys.size > 0 ? keys : null }));
      },
      reset: () => {
        setActiveStory(null);
        setStoryResult(null);
        setFilters(EMPTY_FILTERS);
        setSelectedId(null);
      },
      activeStory,
      storyResult,
      storyFocus: activeStory ? (getStoryById(activeStory)?.focus ?? null) : null,
      storyHeadlines,
      setStory,
      rollingDimension: storyResult?.rollingDimension ?? null,
    }),
    // setStory is recreated each render but only reads `derived`, which is
    // already a dependency, so it's safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived, filtered, filters, selectedId, activeStory, storyResult, storyHeadlines],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExplorer(): ExplorerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExplorer must be used within ExplorerProvider");
  return v;
}
