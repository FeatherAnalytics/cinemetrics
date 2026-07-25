# Continuity Ledger: Stats Story Promotion

## Goal

Turn `/lab` prototypes into a working preview of the stats story at `/lab/stats`:
all promoted charts, store-driven, with cross-filtering and selection behavior
matching the main page. NOT wiring the story chip mechanism yet, and no filter
rail. Done when clicking a bar/row/column populates `SelectionPanel` with the
matching watches, and #5c recolors to the active filter.

## Constraints

- Charts live in `web/src/components/stats/`, one file per chart. Pure helpers in
  `web/src/lib/statsChart.ts` so they are testable.
- Real components take NO props and pull from `useExplorer()`, matching
  `CountryBars.tsx:25`. Lab versions took props.
- Selection is a `Set<string>` of `watchKey(w)` passed to `setSelection`.
  `SelectionPanel` renders when `filters.selection || filters.country`.
- American English everywhere, including comments. No em-dashes.
- "No data" = `#eceae3` + INSET ink outline (`insetRect`), never a traced line.
- Density ramp crimson `#c01023` to chrome gray `#b3b1a6`, never a genre color.
- Branch: `feat/chart-prototypes`. Tests: `npx vitest run` from `web/`.

## Key Decisions

- Preview route is `/lab/stats`, separate from `/lab`, so the raw prototypes stay
  reviewable side by side until the real swap lands.
- Eight charts on it: 1 (monthly pace), 2 (weekday), 5c (cumulative), 6 (rewatch
  mix), 6b (viewing velocity, monthly), 10 (genre pairing), 11 (ratings by
  genre), 12 (viewings to date).
- #1 ships as PACE only (days between films), raw count version deleted. Bar
  height stays the rate so taller = more watching; only the label inverts.
- #5c recolors on filter: the filtered group keeps its genre color, everything
  else collapses to one chrome-gray "other" band.
- Responsive width deferred; still `W = 720` until the real promotion.

## State

- Done:
  - [x] Phase 1: Chart fixes from review
    - [x] #1 pace label is a bare number; raw-count version removed
    - [x] #12 leader lines removed, right-margin labels bolded
    - [x] no-data outlines INSET (`insetRect`) in #6, #6b, #10 so outlined marks
          measure the same as plain ones
  - [x] Phase 2: Pure helpers extracted to `web/src/lib/statsChart.ts`
  - [x] Phase 3: 8 charts promoted into `web/src/components/stats/`
  - [x] Phase 4: `/lab/stats` route: ExplorerProvider + SelectionPanel + charts
  - [x] Phase 5: Click-to-select on bars, segments, boxes, cells, year labels
    - [x] `pick.ts` gives every chart the same contract, including toggle-off
    - [x] Verified in browser: October = 131 watches / 125 films; 2020 rewatch
          segment = 30 watches / 28 films; clicking again clears
  - [x] Phase 6: #5c filter-aware recoloring (matching vs everything else)
  - [x] Phase 7: 40 tests for the extracted helpers; 163 pass overall
  - [x] Phase 8: Review round two
    - [x] `/lab/stats` collapsed into `/lab`; `components/lab/` deleted entirely
    - [x] #12 right margin is an evenly-spaced two-column table; hover crosshair
          reads every year at the hovered calendar date, like #5c
    - [x] #11 n moved above the 5-star tick and bolded
    - [x] #10 no-data outlines drawn per EDGE so shared borders are single weight
    - [x] Round axis ticks: #5c steps by 100, #12 by 50 (`ticksEvery`/`ceilTo`)
    - [x] 167 tests pass
  - [x] Phase 9: Review round three
    - [x] #10 outlines only where a cell meets EMPTY space, never a neighbor
    - [x] #6b sheet-era band traced as a staircase off the bars' own edges;
          box outlines were filling the inter-bar gaps into a solid block
    - [x] #12 rows resort live by the hovered value, highest first
    - [x] #12 a year past its data holds its final value at half opacity
  - [x] Phase 10: Consistency pass + editorial analysis
    - [x] Shared vocabulary in `statsChart.ts`: MONTH_ABBR, DAY_ABBR, WEEKEND,
          CLICK_HINT, SPLIT_LEGEND. Five click phrasings collapsed to one; #12's
          ambiguous single-letter month axis replaced with the shared 3-letter
    - [x] #10 outline is now a PERIMETER around the whole region, every cell,
          not a marker on n=1 cells
    - [x] `thoughts/STATS-STORY-NARRATIVE.md`: signal vs noise, four story
          beats, ink-ratio checklist, the case for cutting #11
  - [x] Phase 11: Polish pass
    - [x] Genres sorted ALPHABETICALLY everywhere (`GENRE_ALPHA`, Other last).
          The palette's `GENRE_ORDER` is a color-PRIORITY order, not an axis order
    - [x] #11 kept (the clumping IS the finding), reduced to the 5 filter genres
          + Other, assigned by `primaryGenre` so a column selects exactly what
          the filter rail would. It previously counted a film in every genre it
          carried, so clicking a box selected a different set than filtering did
    - [x] Viewing velocity: default MONTH, pill toggles matching RollingRating,
          second toggle all/first/rewatch, single series, max + median ticks
    - [x] #6 (first vs rewatch by year) DELETED; velocity supersedes it
    - [x] "What I go back to" is option A only, with mirrored avg-rating bars in
          the style of CountryBars; totals moved into a dynamic blurb
    - [x] Pace by month divides by CALENDAR days, not observed days. Moves Jan
          3.1 to 3.3 and Jul 3.4 to 3.6: the partial months stop reading as busy
    - [x] "click to select" removed everywhere; `SPLIT_LEGEND` and
          `exposureDays` deleted as dead
  - [x] Phase 12: Responsive width
    - [x] `useWidth` extracted from RollingRating to `lib/useWidth.ts`; the
          five `W = 720` charts measure their column and draw 1:1 in CSS px
    - [x] Without a viewBox, `maxWidth: "100%"` CLIPPED these charts below
          720 rather than scaling them. Mobile was losing the right months
    - [x] Two container feedback loops fixed: `main` is a flex item of a
          column flex body, where `mx-auto` makes its cross size
          shrink-to-fit, and the chart column was a bare `grid` whose
          implicit track is max-content. Both sized to the charts while the
          charts sized to them, pinning everything at 720. Now `w-full` and
          `grid-cols-1`; the requirement is documented on the hook
    - [x] Genre pairing grows its cells to fill, floor 34, cap 52
  - [x] Phase 13: The story swap
    - [x] `ChartId` + `CHART_TITLES` carry the 8 stats ids; `ChartSection`
          gained `mode`, defaulting to narrative
    - [x] `computeStats` MEASURES its headline: pace gap between the busiest
          and quietest month against the rating gap between those months
    - [x] `dismissOnFilter: false`. Every filter setter cleared activeStory,
          which under a set swap pulled all 8 charts off the page mid-click,
          taking the chart just clicked with it. 12 setters now route through
          one guarded helper; `reset` deliberately does not
    - [x] Verified: Oct = 131 watches / 125 films with charts staying put,
          second click clears, `?story=stats` deep-links, Spooktober still
          drops out on a hand filter
  - [x] Phase 14: Review round four
    - [x] CORRECTED: pace by month bar height is the RATE, so the TALLEST bar
          is the busiest month and carries the SMALLEST number (Oct = 1.7).
          Prior copy said the opposite. Rule now in the blurb and in a header
          comment on MonthlyPace
    - [x] Both ANOVA captions deleted. The tests now GATE the story subtext
          instead of printing F and p
    - [x] Story notes 8 to 2; blurbs to one sentence; rewatch note dropped as
          a verbatim duplicate of its blurb
    - [x] Velocity split by genre color; no second legend, cumulative below
          already carries an identical one
    - [x] Weekday bars label distance from the median day, in the house
          value-label style (`valueLabelFill`, 11px, bold, inside/outside)
    - [x] Genre pairing axis labels take their genre color where one exists
    - [x] Keyword values moved ACROSS the zero line from their own bar, black
    - [x] Chip reads "Dive deep"; filter rail stays OPEN and drives the charts
    - [x] `scrollToPrimary: false` + pace by month leads, so the story lands
          at the top with its headline on screen
- Now: [→] Ready for the four story beats in STATS-STORY-NARRATIVE.md.
- Remaining:
  - [ ] `ChartTakeaway` per stats section, matching the narrative sections
  - [ ] Hover readouts on the stats charts that lack them (only cumulative and
        viewings-to-date have one). Must be distinct from the story annotations
        and show something beyond the axis
  - [ ] `/lab` now renders the same components as the main page via
        `StatsStoryPreview.tsx`. Duplicate section list, will drift: delete it
        or keep it deliberately as a bare review surface
  - [ ] Split the one eight-chart story into the four beats

## Open Questions

- UNCONFIRMED: should #12's year lines be clickable too, or is click-select only
  for bar-shaped marks? Assuming bars first, lines later if wanted.
- UNCONFIRMED: where #12 belongs long term, main page or stats story. It
  currently ships only inside the stats story.
- UNCONFIRMED: viewing velocity is genre-split with no legend of its own,
  relying on the cumulative chart directly below it and the (now open) filter
  rail. A second identical legend would be exactly the duplication that was
  called out; confirm that reads as intended.

## Standing instruction (raised across multiple sessions)

**Prune harder, and never duplicate a number.** Every chart element has to earn
its place: if the blurb, the chart strip, the headline and the story note can
all say a thing, exactly one of them should. Construction detail belongs in
code comments, not on screen. Before adding copy to a chart, READ the chart's
code and confirm what it actually encodes.

## Working Set

- Prototypes: `web/src/components/lab/LabCharts.tsx` (source of the chart bodies)
- Plan of record: `thoughts/STATS-STORY-SWAP.md`
- Backlog + conventions: `docs/CHART-IDEAS.md`
- Store: `web/src/lib/store.tsx` (`useExplorer`, `filterWatches`, `setSelection`)
- Selection UI: `web/src/components/SelectionPanel.tsx`
- Hover pattern to copy: `web/src/components/RollingRating.tsx:58-81`
- Checks: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (from `web/`)
