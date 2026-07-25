# The stats story swap

Written 2026-07-25. The CHARTS are now promoted and working at `/lab/stats`
(`web/src/components/stats/`, helpers in `web/src/lib/statsChart.ts`, 40 tests).
What remains unwired is the STORY machinery: the `mode` field, the chips, and
the filter rail. That part is below.

`web/src/components/lab/LabCharts.tsx` is now redundant for everything on the
swap list; it is kept only so the raw prototypes stay reviewable side by side.
Safe to delete once #1, #2 and #12 have homes.

---

## The swap list

Five charts, all statistical, all currently prototyped in `/lab`:

| # | Section title | Proposed `ChartId` | Lab component |
|---|---|---|---|
| 5c | Cumulative watches | `cumulative` | `CumulativeByGenre` |
| 6 | First watches vs rewatches | `rewatchmix` | `FirstVsRewatch` |
| 6b | **Viewing velocity** | `velocity` | `MonthlySplit` |
| 10 | Genre pairing | `pairing` | `GenreHeatmap` |
| 11 | Ratings by genre | `genrebox` | `GenreBoxes` |

**#5 and #5b are dropped and deleted.** #6b is #5's chart with the first/rewatch
split stacked inside it, so #6b's total height at any x *is* #5's value: keeping
both drew the same curve twice. #6b inherits the name "Viewing velocity".

✅ **#6b is decided: `MonthlySplit`, stacked bars, no smoothing.** A month is a
real unit rather than a tuning parameter, every bar is exactly what happened in
that month, and the bars line up with the year ticks. Tried and rejected, all
deleted: a 10-day mean (fragmented both bands into slivers), weekly bars (did not
align to year boundaries), and a 30-day trailing mean (smooth, but the window was
a choice needing justification).

## Why a swap and not an append

`docs/CHART-IDEAS.md` X1c: *"this one would replace entire charts with
statistics-minded charts. The stats are the story."* So when the stats story is
active the four charts above render and the eight narrative ones do not. Nothing
is added to the default page, which is what X1 exists to protect.

The existing story machinery cannot express this on its own: `StoryConfig` only
carries `focus: {primary, emphasize, dim}` over a fixed `ChartId` union, and
`ExplorerApp.tsx` maps a hardcoded `CHART_SECTIONS`. A story dims and filters the
same eight charts; it cannot introduce charts of its own. Hence the `mode` field
below.

---

## Wiring

### 1. `web/src/lib/stories.ts`

Extend the union and the titles:

```ts
export type ChartId =
  | "spiral"
  | "contrarian"
  | "countries"
  | "stripes"
  | "rolling"
  | "rewatch"
  | "keywords"
  | "franchise"
  // stats-story charts: rendered only while the stats story is active
  | "cumulative"
  | "rewatchmix"
  | "velocity"
  | "pairing"
  | "genrebox";

export const CHART_TITLES: Record<ChartId, string> = {
  // ...existing eight...
  cumulative: "Cumulative watches",
  rewatchmix: "First watches vs rewatches",
  velocity: "Viewing velocity",
  pairing: "Genre pairing",
  genrebox: "Ratings by genre",
};
```

Add the story itself. `dim` stays empty: the narrative charts are absent, not
dimmed, so there is nothing to fade.

```ts
function computeStats(films: Film[], watches: EnrichedWatch[]): StoryResult {
  // Headline should be a real measured finding, not a label. Candidates:
  // the widest genre median gap (from the box plot), or the steepest year of
  // the cumulative curve. Pick one and compute it here rather than hardcoding.
  return {
    headline: "…", // TODO: compute
    chip: "The stats",
    notes: {
      cumulative: "…",
      rewatchmix: "…",
      velocity: "…",
      pairing: "…",
      genrebox: "…",
    },
  };
}

// appended to STORIES
{
  id: "stats",
  label: "The stats",
  focus: { primary: "cumulative", emphasize: ["cumulative", "genrebox"], dim: [] },
  compute: computeStats,
},
```

Note `computeStats` has real material to work with now: the rewatch share went
from 20.5% in 2020 to 43.4% in 2021 and settles around a third, and October
outdraws November 131 to 38.

### 2. `web/src/components/ExplorerApp.tsx`

Add a `mode` to the section type, defaulting to narrative so the existing eight
entries need no edit:

```ts
type ChartSection = {
  id: ChartId;
  title: string;
  blurbClass: string;
  blurb: ReactNode;
  Chart: () => React.JSX.Element;
  // Narrative charts are the default page. Stats charts REPLACE them while the
  // stats story is active; the two sets are never on screen together.
  mode?: "narrative" | "stats";
};
```

Append the four entries to `CHART_SECTIONS` with `mode: "stats"`, then filter at
render. In `Explorer()`, after `activeStory` is destructured:

```ts
// The stats story swaps the chart set rather than dimming it: see X1c.
const wanted = activeStory === "stats" ? "stats" : "narrative";
const sections = CHART_SECTIONS.filter((s) => (s.mode ?? "narrative") === wanted);
```

and map `sections` instead of `CHART_SECTIONS` at `ExplorerApp.tsx:307`.

### 3. Promotion of the chart bodies — DONE

Built as `web/src/components/stats/{ViewingVelocity,CumulativeWatches,
ViewingsToDate,RewatchMix,MonthlyPace,WeekdayCounts,RatingsByGenre,
GenrePairing}.tsx`, plus shared `CategoryBars.tsx` and `pick.ts`. All take no
props and pull from `useExplorer()`. Composed by `StatsStoryPreview.tsx` at
`/lab/stats`, which wires `ExplorerProvider` and `SelectionPanel`.

Selection contract, shared via `pick.ts`: clicking a mark selects exactly the
watches behind it; clicking the same mark again clears. Verified in the browser
(October = 131 watches, 2020's rewatch segment = 30).

Original notes kept below for the record.

### 3a. Original promotion notes

`web/src/components/stats/{CumulativeWatches,RewatchMix,ViewingVelocity,GenrePairing,RatingsByGenre}.tsx`.

The lab versions take `watches` as a **prop**; real sections take **no props**
and pull from context, so each needs the `CountryBars.tsx:25` treatment:

```ts
const { all, byId, filters } = useExplorer();
const watches = useMemo(() => filterWatches(all, filters), [all, filters]);
```

**#5c specifically: hover must update the legend numbers.** The prototype's legend
shows each genre's FINAL total, which is the one number the chart already draws.
The useful reading is each genre's cumulative count at the hovered date. Copy the
shape from `RollingRating.tsx:58-81`: a shared `hoverX` lifted to the parent, each
child reading it, with the hovered month index driving the legend. Note that file's
warning about defining the child component at module scope, or every panel remounts
on each hover.

Also required on promotion, none of which the prototypes do:

- **Cut the commentary back.** The lab file's comments are long because every
  block had to argue for itself during review. That is scratch, not a house
  style: keep the reasoning a future reader needs (the warmup rule, the D5
  three-state, why ANOVA and not R²) and delete the rest.
- **American English.** The site is US spelling: color, gray, centered,
  neighboring, labeled. Applies to comments and UI copy alike.
- Responsive width. Every lab chart hardcodes `const W = 720`.
- `ChartTakeaway` under each, matching the other sections.
- Cross-filter behavior, or a deliberate decision that these are read-only.
  Read-only is defensible: they are summaries, not selectors.
- The `MIN_FILMS_PER_GENRE` / `MIN_FILMS_PER_PAIR` thresholds move out of the lab
  file with them; they are load-bearing, see #10c.

### 4. Housekeeping

- `stories.ts:24` comment says titles are kept in sync with `page.tsx`. Stale:
  the sections live in `ExplorerApp.tsx` now. Fix while editing.
- Delete `web/src/app/lab/` and `web/src/components/lab/` once #1, #2 and #6 are
  resolved and the four bodies above are promoted.

---

## Open questions

- UNCONFIRMED: does the stats story keep the filter rail live? The other stories
  drive filters themselves; this one has nothing to filter *to*. Leaving the rail
  active means the stats respond to the user's filters, which is probably the
  point, but it makes the headline in `computeStats` a moving number.
- UNCONFIRMED: where **#12 (viewings to date)** belongs, main page or stats story.
  It is the only chart in `/lab` without a home.
- Now that #6b is unsmoothed monthly, the trailing-mean warmup rule no longer
  applies to anything in the lab. If a smoothed chart is ever reintroduced, the
  rule is: DROP the first `win-1` days rather than dividing by a partial window.
  Dividing made day one the raw count for that day, which for a bulk sheet-era
  entry was ~30x any real 30-day mean and took the whole vertical scale with it.
  Matches RollingRating.
