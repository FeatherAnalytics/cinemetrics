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
import type { Dataset, EnrichedWatch, Film, WatchlistFilm } from "./types";
import { canonicalGenre, primaryGenre, type GenreKey } from "./palette";
import { countryName } from "./countries";
import { languageName } from "./languages";
import { watchKey } from "./brush";
import { filmHearts } from "./likedChart";
import {
  STORIES,
  LANDING_STORY,
  chartSetFor,
  computeStoryHeadlines,
  type StoryResult,
  type ChartId,
} from "./stories";

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
    if (filters.votesRange) {
      const v = f?.imdb_votes;
      if (v == null || v < filters.votesRange[0] || v > filters.votesRange[1]) return false;
    }
    // Canonicalised on both sides: the tag comes from a TMDB-spelled watchlist
    // bar, the film's genres from OMDb, and "Science Fiction" would otherwise
    // match none of the 68 films OMDb calls "Sci-Fi".
    if (
      filters.genreTag &&
      !(f?.genres ?? []).map(canonicalGenre).includes(canonicalGenre(filters.genreTag))
    )
      return false;
    if (filters.keyword && !(f?.keywords ?? []).includes(filters.keyword)) return false;
    if (filters.selection && !filters.selection.has(watchKey(w))) return false;
    return true;
  });
}

/**
 * The subset of `Filters` that means anything for a film nobody has watched.
 *
 * A watchlist film has no watch date, no rating, no rewatch state and no heart,
 * so `yearRange`, `ratingRange`, `rewatch` and `selection` have nothing to test
 * against. They are not merely skipped here — this list drives the RAIL too, so
 * the controls that set them are never shown while the watchlist story is
 * active. Silently ignoring a visible control would be worse than hiding it: the
 * reader would drag the rating slider and watch nothing happen.
 *
 * `rated` and `franchise` are absent for a duller reason: dim_watchlist exports
 * neither, so filtering on them would empty every chart.
 */
export const WATCHLIST_FILTERS = [
  "genres",
  "releaseYearRange",
  "runtimeRange",
  "language",
  "country",
  "votesRange",
  "genreTag",
  "keyword",
] as const satisfies readonly (keyof Filters)[];

/** Pure filtering logic for the watchlist, extracted for testability. */
export function filterWatchlist(
  all: WatchlistFilm[],
  filters: Filters,
): WatchlistFilm[] {
  return all.filter((f) => {
    if (filters.genres.size > 0 && !filters.genres.has(primaryGenre(f))) return false;
    if (filters.releaseYearRange) {
      const y = f.year;
      if (y == null || y < filters.releaseYearRange[0] || y > filters.releaseYearRange[1])
        return false;
    }
    if (filters.runtimeRange) {
      const rt = f.runtime;
      if (rt == null || rt < filters.runtimeRange[0] || rt > filters.runtimeRange[1])
        return false;
    }
    if (filters.language && f.language !== filters.language) return false;
    if (filters.country && !f.production_countries.includes(filters.country)) return false;
    if (filters.votesRange) {
      const v = f.imdb_votes;
      if (v == null || v < filters.votesRange[0] || v > filters.votesRange[1]) return false;
    }
    if (
      filters.genreTag &&
      !f.genres.map(canonicalGenre).includes(canonicalGenre(filters.genreTag))
    )
      return false;
    if (filters.keyword && !f.keywords.includes(filters.keyword)) return false;
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
  /**
   * IMDb vote count, inclusive. How many people logged an opinion, which is the
   * closest thing here to "how obscure is this" — the Hidden Gems story cuts at
   * 10k on the same field.
   *
   * Drops films with no vote count while active, like every other range filter.
   * That bites hardest on the watchlist, where OMDb coverage is partial.
   */
  votesRange: [number, number] | null;
  /**
   * A single TMDB genre NAME, matched against the film's whole genre list.
   *
   * Distinct from `genres`, which holds the five tracked GenreKeys and matches
   * on primaryGenre. That set cannot express Mystery or Science Fiction at all,
   * so the genre chart — which ranks every TMDB genre — had no way to filter
   * through it. The two compose: `genres` narrows by the colour scale, this
   * narrows by the exact tag.
   */
  genreTag: string | null;
  /** A single TMDB keyword, matched against the film's keyword list. */
  keyword: string | null;
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
  votesRange: null,
  genreTag: null,
  keyword: null,
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

type ExplorerValue = {
  films: Film[];
  byId: Map<number, Film>;
  all: EnrichedWatch[];
  filtered: EnrichedWatch[];
  /** Every film on the watchlist, unfiltered. */
  watchlist: WatchlistFilm[];
  /** The watchlist under the reduced rail — see WATCHLIST_FILTERS. */
  filteredWatchlist: WatchlistFilm[];
  yearBounds: [number, number];
  releaseYearBounds: [number, number];
  runtimeBounds: [number, number];
  /** IMDb vote-count bounds across watched films, for the rail's slider. */
  votesBounds: [number, number];
  titleOptions: string[];
  directorOptions: string[];
  actorOptions: string[];
  countryOptions: { iso: string; name: string }[];
  languageOptions: { code: string; name: string }[];
  ratedOptions: string[];
  franchiseOptions: string[];
  /**
   * Rail options measured from the WATCHLIST rather than from watched films.
   * Kept separate because the two sets genuinely differ — the watchlist reaches
   * countries and years the viewing history never does (Soviet films, 1917) —
   * and offering an option that matches nothing reads as a broken filter.
   */
  watchlistOptions: {
    releaseYearBounds: [number, number];
    runtimeBounds: [number, number];
    countryOptions: { iso: string; name: string }[];
    languageOptions: { code: string; name: string }[];
  };
  filters: Filters;
  selectedId: number | null; // tmdb_id of film clicked in a chart, highlighted everywhere
  activeStory: string | null;
  storyResult: StoryResult | null;
  storyFocus: { primary: ChartId; emphasize: ChartId[]; dim: ChartId[] } | null;
  storyHeadlines: ReturnType<typeof computeStoryHeadlines>;
  /**
   * Whether the favorites story is running, and with it the heart vocabulary.
   *
   * Read by the narrative charts, which REPLACE their own encoding while it is on:
   * genre on the swim lane, my rating on the barcode, the residual mirror on the
   * country and keyword bars. Derived here rather than passed down, because eight
   * charts threading one boolean through their callers is eight chances to forget.
   */
  heartLens: boolean;
  setStory: (id: string | null) => void;
  rollingDimension: string | null;
  toggleGenre: (g: GenreKey) => void;
  setYearRange: (r: [number, number]) => void;
  setReleaseYearRange: (r: [number, number]) => void;
  setRuntimeRange: (r: [number, number]) => void;
  setRatingRange: (r: [number, number]) => void;
  setVotesRange: (r: [number, number]) => void;
  setGenreTag: (g: string | null) => void;
  setKeyword: (k: string | null) => void;
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
    // Built from every watch, before any filter exists. The heart is a property
    // of the film, so which rows happen to be in view cannot change whether it is
    // known. See the note on `filmHearts`.
    const hearts = filmHearts(data.watches);
    const all: EnrichedWatch[] = data.watches.map((w) => {
      const d = new Date(w.date + "T00:00:00Z");
      return {
        ...w,
        film: byId.get(w.tmdb_id),
        d,
        yearFrac: yearFrac(d),
        heart: w.liked ?? hearts.get(w.tmdb_id) ?? null,
      };
    });
    const watchYears = all.map((w) => w.d.getUTCFullYear());
    const releaseYears = data.films.map((f) => f.year).filter((y): y is number => y != null);
    const runtimes = data.films.map((f) => f.runtime).filter((r): r is number => r != null);
    // Rounded out to 5-minute marks so the slider ends land on clean values.
    const runtimeBounds: [number, number] = runtimes.length
      ? [Math.floor(Math.min(...runtimes) / 5) * 5, Math.ceil(Math.max(...runtimes) / 5) * 5]
      : [0, 300];
    // Vote counts span five orders of magnitude, so the rail slides in log space
    // rather than linear; the bounds here are the raw counts it maps between.
    const votes = data.films.map((f) => f.imdb_votes).filter((v): v is number => v != null && v > 0);
    const votesBounds: [number, number] = votes.length
      ? [Math.min(...votes), Math.max(...votes)]
      : [1, 1_000_000];

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

    // `watchlist` is optional in the payload so an older cinemetrics.json (or a
    // fixture that predates the mart) renders the other stories instead of
    // throwing on a missing key.
    const watchlist = data.watchlist ?? [];
    const wlYears = watchlist.map((f) => f.year).filter((y): y is number => y != null);
    const wlRuntimes = watchlist.map((f) => f.runtime).filter((r): r is number => r != null);
    const wlIsos = [...new Set(watchlist.flatMap((f) => f.production_countries ?? []))];
    const watchlistOptions = {
      releaseYearBounds: (wlYears.length
        ? [Math.min(...wlYears), Math.max(...wlYears)]
        : [1900, 2030]) as [number, number],
      runtimeBounds: (wlRuntimes.length
        ? [Math.floor(Math.min(...wlRuntimes) / 5) * 5, Math.ceil(Math.max(...wlRuntimes) / 5) * 5]
        : [0, 300]) as [number, number],
      countryOptions: wlIsos
        .map((iso) => ({ iso, name: countryName(iso) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      languageOptions: [
        ...new Set(watchlist.map((f) => f.language).filter((l): l is string => !!l)),
      ]
        .map((code) => ({ code, name: languageName(code) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };

    return {
      films: data.films,
      byId,
      all,
      watchlist,
      watchlistOptions,
      yearBounds: [Math.min(...watchYears), Math.max(...watchYears)] as [number, number],
      releaseYearBounds: [Math.min(...releaseYears), Math.max(...releaseYears)] as [number, number],
      runtimeBounds,
      votesBounds,
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
  const filteredWatchlist = useMemo(
    () => filterWatchlist(derived.watchlist, deferredFilters),
    [derived.watchlist, deferredFilters],
  );

  // Story headlines are computed once from the full dataset — they are stable
  // invitations, not filtered views.
  const storyHeadlines = useMemo(
    () => computeStoryHeadlines(derived.films, derived.all, derived.watchlist),
    [derived.films, derived.all, derived.watchlist],
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
      const result = story.compute(derived.films, derived.all, derived.watchlist);
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
    const result = story.compute(derived.films, derived.all, derived.watchlist);
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

  /**
   * The annotation a story is currently showing.
   *
   * Most stories compute once, when activated, and `storyResult` holds that.
   * A story with `recomputeOnFilter` instead recomputes against the filtered
   * watches, so a headline like "3.4x more in October than November" is a
   * statement about what the reader is actually looking at rather than about
   * the whole library. `computeStoryHeadlines` is untouched by this: the chips
   * stay stable invitations computed from everything.
   *
   * With NO story selected this falls through to the landing story, which is how
   * the landing page keeps a headline without pretending to be a story the reader
   * chose. It always recomputes, because the rail is live there.
   */
  const activeResult = useMemo(() => {
    if (!activeStory) {
      return LANDING_STORY ? LANDING_STORY.compute(derived.films, filtered) : null;
    }
    const cfg = getStoryById(activeStory);
    if (!cfg?.recomputeOnFilter) return storyResult;
    return cfg.compute(derived.films, filtered, filteredWatchlist);
  }, [activeStory, storyResult, derived.films, filtered, filteredWatchlist]);

  /**
   * Filtering by hand normally drops out of the active story, because for the
   * narrative stories the filters ARE the story: leaving the chip lit while the
   * reader filters elsewhere would claim a finding the charts no longer show.
   *
   * A story can opt out with `dismissOnFilter: false`. The stats story does,
   * because it sets no filters and instead swaps the chart SET: dismissing it on
   * filter pulled all eight charts off the page mid-click, taking the chart the
   * reader had just clicked with them.
   *
   * `reset` deliberately does NOT go through here. That is the explicit "clear
   * everything" action and it should clear the story too.
   */
  const exitStoryOnFilter = () => {
    if (activeStory && getStoryById(activeStory)?.dismissOnFilter === false) return;
    setActiveStory(null);
    setStoryResult(null);
  };

  // The context value is memoized so consumers only re-render when state that
  // feeds them actually changes, not on every provider render.
  const value: ExplorerValue = useMemo(
    () => ({
      ...derived,
      filtered,
      filteredWatchlist,
      filters,
      selectedId,
      toggleGenre: (g) => {
        exitStoryOnFilter();
        setFilters((f) => {
          const genres = new Set(f.genres);
          if (genres.has(g)) genres.delete(g);
          else genres.add(g);
          return { ...f, genres };
        });
      },
      setYearRange: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, yearRange: r }));
      },
      setReleaseYearRange: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, releaseYearRange: r }));
      },
      setRuntimeRange: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, runtimeRange: r }));
      },
      setRatingRange: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, ratingRange: r }));
      },
      setVotesRange: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, votesRange: r }));
      },
      // Both toggle: clicking the active bar again clears, the same contract
      // every other click-to-filter chart here uses.
      setGenreTag: (g) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, genreTag: f.genreTag === g ? null : g }));
      },
      setKeyword: (k) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, keyword: f.keyword === k ? null : k }));
      },
      setRewatch: (r) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, rewatch: r }));
      },
      setText: (field, value) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, [field]: value }));
      },
      setCountry: (iso) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, country: f.country === iso ? null : iso }));
      },
      setLanguage: (code) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, language: f.language === code ? null : code }));
      },
      setRated: (rated) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, rated: f.rated === rated ? null : rated }));
      },
      setFranchise: (name) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, franchise: f.franchise === name ? null : name }));
      },
      setSelected: (id) => setSelectedId((cur) => (cur === id ? null : id)),
      setSelection: (keys) => {
        exitStoryOnFilter();
        setFilters((f) => ({ ...f, selection: keys && keys.size > 0 ? keys : null }));
      },
      reset: () => {
        // Not exitStoryOnFilter: reset is the explicit "clear everything"
        // action, so it clears the story even when the story opted out of
        // being dismissed by filtering.
        setActiveStory(null);
        setStoryResult(null);
        setFilters(EMPTY_FILTERS);
        setSelectedId(null);
      },
      activeStory,
      storyResult: activeResult,
      // The landing page focuses too: its primary chart is where the annotation
      // renders. `dim` is empty on it, so nothing is faded by having no story.
      storyFocus:
        (activeStory ? getStoryById(activeStory)?.focus : LANDING_STORY?.focus) ?? null,
      storyHeadlines,
      heartLens: chartSetFor(activeStory) === "heart",
      setStory,
      rollingDimension: activeResult?.rollingDimension ?? null,
    }),
    // setStory and exitStoryOnFilter are recreated each render but only read
    // `derived` and `activeStory`, both already dependencies, so the closures
    // here are never stale and both are safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived, filtered, filteredWatchlist, filters, selectedId, activeStory, activeResult, storyHeadlines],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExplorer(): ExplorerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExplorer must be used within ExplorerProvider");
  return v;
}
