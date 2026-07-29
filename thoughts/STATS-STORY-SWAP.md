# The stats story swap

Written 2026-07-25, revised after the swap shipped.

**Status: the swap is DONE.** The charts are promoted, the `mode` field exists,
`computeStats` measures its own headline, and "The stats" is live in the chip
strip. What remains is polish, listed at the bottom.

---

## What shipped

Eight statistical charts in `web/src/components/stats/`, with pure logic in
`web/src/lib/statsChart.ts`. Activating the stats story replaces the eight
narrative charts with these; the two sets are never on screen together.

| `ChartId` | Section title | Component |
|---|---|---|
| `velocity` | Viewing velocity | `ViewingVelocity` |
| `cumulative` | Cumulative watches | `CumulativeWatches` |
| `ytd` | Viewings to date | `ViewingsToDate` |
| `rewatched` | What I go back to | `MostRewatched` |
| `monthly` | Pace by month | `MonthlyPace` |
| `weekday` | Pace by weekday | `WeekdayCounts` |
| `genrebox` | Ratings by primary genre | `RatingsByGenre` |
| `pairing` | Genre pairing | `GenrePairing` |

Shared by them: `CategoryBars.tsx`, `Toggle.tsx`, `pick.ts`.

### Charts that were tried and cut

- **#5 and #5b (cumulative rate)** are gone. #6b is #5's chart with the split
  stacked inside it, so #6b's total height at any x *is* #5's value: keeping
  both drew the same curve twice.
- **#6 (first watches vs rewatches by year)** is gone too, for the same reason
  one level up: it and viewing velocity drew one finding at two zoom levels.
  Velocity absorbed it as a `first / rewatch / all` toggle.
- Viewing velocity's shape was settled the same way. Rejected and deleted: a
  10-day mean (fragmented both bands into slivers), weekly bars (did not align
  to year boundaries), a 30-day trailing mean (smooth, but the window was a
  choice needing justification). A calendar month is a real unit, not a tuning
  parameter, so every bar is exactly what happened.

## Why a swap and not an append

`docs/CHART-IDEAS.md` X1c: *"this one would replace entire charts with
statistics-minded charts. The stats are the story."* Nothing is added to the
default page, which is what X1 exists to protect.

The pre-existing story machinery could not express this: `StoryConfig` only
carried `focus: {primary, emphasize, dim}` over a fixed `ChartId` union, and
`ExplorerApp.tsx` mapped a hardcoded `CHART_SECTIONS`. A story could dim and
filter the same eight charts; it could not bring charts of its own.

---

## How it is wired

### 1. `web/src/lib/stories.ts`

`ChartId` carries the eight stats ids, `CHART_TITLES` their titles, and
`computeStats` produces the headline and the per-chart notes.

The headline is MEASURED, not written down: it pairs the pace gap between the
busiest and quietest calendar month against the rating gap between those same
two months. That is the thesis in one sentence, and it cannot drift away from
the charts under it.

> I watch 3.4x more in October than November, and rate them 1 point apart

`focus.dim` is empty by design. The narrative charts are absent, not faded, so
there is nothing left on screen to dim.

### 2. `web/src/components/ExplorerApp.tsx`

`ChartSection` gained `mode?: "narrative" | "stats"`, defaulting to narrative so
the original eight entries needed no edit. At render:

```ts
const wanted = activeStory === "stats" ? "stats" : "narrative";
const sections = CHART_SECTIONS.filter((s) => (s.mode ?? "narrative") === wanted);
```

`Chart` widened to `() => React.JSX.Element | null`, since several stats charts
return null when a filter empties them.

### 3. `dismissOnFilter` — the bug the swap exposed

Every filter setter in `store.tsx` cleared `activeStory`, on the reasoning that
for a narrative story the filters ARE the story: leaving the chip lit while the
reader filters elsewhere would claim a finding the charts no longer show.

Correct for those seven. Under a chart-set swap it meant **clicking any stats
mark pulled all eight charts off the page mid-click**, taking the chart just
clicked with it, and dropped the selection it was making.

Stories now opt out with `dismissOnFilter: false`. The twelve filter setters
route through one `exitStoryOnFilter` helper. `reset` deliberately does not —
that is the explicit clear-everything action and it clears the story too.

### 4. Responsive width

Every stats chart hardcoded `W = 720`. Since the SVGs carry no `viewBox`,
`maxWidth: "100%"` **clipped** them below that width rather than scaling them.
They now measure their column via `lib/useWidth.ts` and draw 1:1 in CSS pixels,
so the axis type stays a constant size at any width.

Two container fixes were needed before measuring worked at all, both instances
of the same circularity:

- `main` is a flex item of a column flex `body`, and `mx-auto` there makes its
  cross size **shrink-to-fit**. So main sized to the charts while the charts
  sized to main, and the pair settled on whatever width the charts first drew
  at (720) no matter how wide the window got. Fixed with `w-full`.
- The chart column was a bare `grid`, whose implicit track is `max-content` —
  the same loop one level down. Fixed with `grid-cols-1`.

The requirement is written on `useWidth` itself so it cannot silently return.

---

## Still to do

- `ChartTakeaway` under each stats section, matching the narrative sections.
- Hover readouts. Cumulative watches and viewings to date have them; the rest do
  not. Two rules: visually and behaviorally distinct from the story annotations,
  and showing something worth knowing rather than restating the axis.
- `/lab` now renders the same eight components as the main page through
  `StatsStoryPreview.tsx`. It is a duplicate section list that will drift.
  Delete it, or keep it deliberately as a bare review surface.
- The narrative doc argues for FOUR story beats rather than one eight-chart
  story. Deferred: one story shipped first so the machinery exists and is
  testable. See `STATS-STORY-NARRATIVE.md`.

## Open questions

- The filter rail stays live during the stats story, so the charts respond to
  the reader's filters. The headline does not move with them: `computeStoryHeadlines`
  runs once over the FULL dataset, which is what keeps the chips stable
  invitations rather than moving numbers.
- UNCONFIRMED: where **viewings to date** belongs long term, main page or stats
  story. It currently ships only inside the stats story.
- If a smoothed chart is ever reintroduced, the warmup rule is: DROP the first
  `win-1` days rather than dividing by a partial window. Dividing made day one
  the raw count for that day, which for a bulk sheet-era entry was ~30x any real
  30-day mean and took the whole vertical scale with it. Matches RollingRating.
