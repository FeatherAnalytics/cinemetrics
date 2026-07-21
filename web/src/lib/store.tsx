"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Dataset, EnrichedWatch, Film } from "./types";
import { primaryGenre, type GenreKey } from "./palette";
import { countryName } from "./countries";
import { watchKey } from "./brush";
import { STORIES, type StoryResult, type ChartId } from "./stories";

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
  selection: null,
};

type ExplorerValue = {
  loading: boolean;
  films: Film[];
  byId: Map<number, Film>;
  all: EnrichedWatch[];
  filtered: EnrichedWatch[];
  yearBounds: [number, number];
  releaseYearBounds: [number, number];
  titleOptions: string[];
  directorOptions: string[];
  actorOptions: string[];
  countryOptions: { iso: string; name: string }[];
  filters: Filters;
  selectedId: number | null; // tmdb_id of film clicked in a chart, highlighted everywhere
  activeStory: string | null;
  storyResult: StoryResult | null;
  storyFocus: { primary: ChartId; emphasize: ChartId[]; dim: ChartId[] } | null;
  setStory: (id: string | null) => void;
  rollingDimension: string | null;
  toggleGenre: (g: GenreKey) => void;
  setYearRange: (r: [number, number]) => void;
  setReleaseYearRange: (r: [number, number]) => void;
  setRewatch: (r: Filters["rewatch"]) => void;
  setText: (field: TextField, value: string) => void;
  setCountry: (iso: string | null) => void;
  setSelected: (id: number | null) => void;
  setSelection: (keys: Set<string> | null) => void;
  reset: () => void;
};

const Ctx = createContext<ExplorerValue | null>(null);

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeStory, setActiveStory] = useState<string | null>(null);
  const [storyResult, setStoryResult] = useState<StoryResult | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/cinemetrics.json`)
      .then((r) => r.json())
      .then((d: Dataset) => setData(d));
  }, []);

  const derived = useMemo(() => {
    if (!data)
      return {
        films: [] as Film[],
        byId: new Map<number, Film>(),
        all: [] as EnrichedWatch[],
        yearBounds: [2019, 2026] as [number, number],
        releaseYearBounds: [1920, 2026] as [number, number],
        titleOptions: [] as string[],
        directorOptions: [] as string[],
        actorOptions: [] as string[],
        countryOptions: [] as { iso: string; name: string }[],
      };
    const byId = new Map(data.films.map((f) => [f.tmdb_id, f]));
    const all: EnrichedWatch[] = data.watches.map((w) => {
      const d = new Date(w.date + "T00:00:00Z");
      return { ...w, film: byId.get(w.tmdb_id), d, yearFrac: yearFrac(d) };
    });
    const watchYears = all.map((w) => w.d.getUTCFullYear());
    const releaseYears = data.films.map((f) => f.year).filter((y): y is number => y != null);
    // Autocomplete option lists (director/actors are comma-separated -> split).
    const directorOptions = uniqueSorted(
      data.films.flatMap((f) => (f.director ?? "").split(",")),
    );
    const actorOptions = uniqueSorted(data.films.flatMap((f) => (f.actors ?? "").split(",")));
    const isos = [...new Set(data.films.flatMap((f) => f.production_countries ?? []))];
    const countryOptions = isos
      .map((iso) => ({ iso, name: countryName(iso) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      films: data.films,
      byId,
      all,
      yearBounds: [Math.min(...watchYears), Math.max(...watchYears)] as [number, number],
      releaseYearBounds: [Math.min(...releaseYears), Math.max(...releaseYears)] as [number, number],
      titleOptions: uniqueSorted(data.films.map((f) => f.title)),
      directorOptions,
      actorOptions,
      countryOptions,
    };
  }, [data]);

  const { all } = derived;

  const filtered = useMemo(() => filterWatches(all, filters), [all, filters]);

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

  const value: ExplorerValue = {
    loading: !data,
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
    setStory,
    rollingDimension: storyResult?.rollingDimension ?? null,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExplorer(): ExplorerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExplorer must be used within ExplorerProvider");
  return v;
}
