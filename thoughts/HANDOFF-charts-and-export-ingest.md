# Handoff: the stats story shipped, next is `liked`

Branch `feat/chart-prototypes`, pushed through `9853943`. No PR yet.

## READ THIS FIRST

The same three notes have been given across four sessions and keep being
rediscovered. They cost more time than any feature on this branch. Do not make
them a fourth time.

### 1. Read the chart's code before you write a word about it

Not the title, not the axis strip. The component.

The trap that caught the last session: `MonthlyPace` plots the RATE (watches per
calendar day) as bar height, and only the LABEL inverts to days-between-films.
So the tallest bar is the busiest month and it carries the SMALLEST number.
October is the tallest bar and reads `1.7`. Copy claiming "a short bar is a busy
month" shipped because the file was never opened.

Wrong copy about a chart is worse than no copy: it teaches the reader to
misread the picture.

### 2. Prune, and never state a number twice

Every element earns its place or goes. If the blurb, the chart's own strip, the
story headline and the story note can all carry a fact, exactly one should.

- Construction detail ("a trailing mean has to pick a window") belongs in code
  comments. It is already there. Do not also put it on screen.
- Statistical apparatus almost never earns its place in UI copy. Two charts used
  to print `No significant rating difference by weekday (F(6, 787) = 1.45,
  p = 0.193, n = 794)`. The ANOVAs still run; they now GATE whether a plain-English
  claim is made, and print nothing.
- Never announce that a chart is interactive. "Drag across it" was cut for this.
  Cross-filtering is the site's baseline expectation; saying it talks down to
  the reader.
- If the y axis already carries the value, the bar label must carry something
  else. Weekday bars label their percentage distance from the median day,
  because the axis already runs 0 → peak with the median marked.

### 3. Copy the existing components. Do not reinvent them.

New charts have to fit the site's behaviors, aesthetics and visuals. The way to
get that is to open the closest existing chart FIRST and copy it.

| Reference | What it defines |
|---|---|
| `CountryBars.tsx` | Horizontal bars, mirrored second series, value labels on the bar via `valueLabelFill`, hover `fillOpacity` 0.72 → 0.9, non-selected rows dim to 0.35, `+ N more …` tail row |
| `RollingRating.tsx` | Measured 1:1 pixel plots, hover state lifted to the parent, child component at module scope so panels don't remount |
| `barChart.ts` | `BAR_H`, `GAP`, `valueLabelFill` — the shared vocabulary |
| `stats/CategoryBars.tsx` | Vertical bars, median tick, `barLabel="value" \| "share"` |
| `lib/useWidth.ts` | Responsive width. Read its caller requirement before using it |

**Never use SVG `<title>` for a data readout.** It renders the browser's native
tooltip: a gray OS box with its own font and its own delay, which looks like
nothing else on this site. Five charts had one; all are gone. Hover readouts go
in the chart's own strip, in the site's type (see `MonthlyPace`, `GenrePairing`,
`CumulativeWatches`). The single surviving `<title>` is on truncated film names
in `MostRewatched`, and only when the name was actually cut.

## Where things are

The stats story is DONE and live on the main page. Eight charts in
`web/src/components/stats/`, pure logic in `web/src/lib/statsChart.ts`.
167 tests, tsc / eslint / `next build` clean.

Activating the **"Dive deep"** chip REPLACES the eight narrative charts rather
than dimming them (`mode: "stats"` on `ChartSection` in `ExplorerApp.tsx`).
Order: pace by month, pace by weekday, viewing velocity, cumulative watches,
viewings to date, what I go back to, ratings by primary genre, genre pairing.

Three flags on `StoryConfig` exist only for this story, and each fixed a real
bug rather than being decoration:

- `dismissOnFilter: false` — every filter setter used to clear `activeStory`,
  which under a chart-set swap pulled all eight charts off the page mid-click,
  taking the chart just clicked with it.
- `scrollToPrimary: false` — `StoryAnnotation` scrolls a story's primary chart
  into view, which is right when the other charts stayed put and wrong when the
  whole set was replaced.
- `recomputeOnFilter: true` — the annotation recomputes against the FILTERED
  watches, so the headline describes what is on screen. The chip strip stays on
  the full dataset so the invitations don't move.

The filter rail stays OPEN during this story and drives the charts. Filtering to
one genre recolors every stats chart to that genre (`accentFor` in
`stats/pick.ts`), and `RatingsByGenre` switches to the SECOND genre.

`/lab` and `components/lab/` are DELETED.

## The goal for next session: layer in `liked`

**Rebuild `/lab` for this.** It was deleted once the stats charts were promoted;
recreate `web/src/app/lab/page.tsx` with a prototype surface, and delete it
again once whatever gets built has a home. Do not prototype on the main page.

`liked` is the least-used column in the dataset and the obvious next dimension:
the site currently has rating (0–100, continuous, my own scale) and nothing
about the binary "did I like it". Those are not the same question and the gap
between them is probably the interesting part.

Starting questions, none of them verified:

- Where do rating and `liked` DISAGREE? A 60 I liked and an 80 I didn't are the
  two most interesting sets on the site and neither is reachable today.
- Does the affection rate move with anything — genre, year, rewatch, runtime —
  when the rating does not? The stats story's whole finding is that nothing
  predicts my rating. If something predicts `liked`, that is a real result.
- Is `liked` more stable across a rewatch than the rating is?

## Data traps that will bite

- **`liked` is THREE-STATE.** `true` / `false` / NULL, where NULL means unknown,
  not "not liked" — the 129 pre-Letterboxd rows. Always filter `liked is not
  null` before computing an affection rate; collapsing them understates it by
  about 7.5 points. This is the single most important trap for next session.
- **`is_rewatch` is three-state the same way, but the column does not say so.**
  The 129 sheet-era rows are all `false` because the Google Sheet had no such
  field. Use `hasKnownRewatchState(w)` and divide by rows that recorded it.
- **"Rewatches" and "returns" are different numbers.** 87 of the 206 flagged
  rewatches are films whose first viewing predates the dataset, so they appear
  once. The data holds 118 returns across 82 films. State which one you mean.
- **Watch dates are already Chicago calendar dates.** Never run them through a
  timezone conversion; it shifts every watch back a day and rotates the whole
  weekday distribution. Parse components off the string (`chicagoParts`).
- **Test every chart under a NARROW filter before calling it done.** Four
  separate defects shipped because everything was only ever checked against the
  full 794 watches. Filter to a small collection (Miyazaki, 9 watches) and to
  the Other genre (25) and look at every chart.

## Conventions to hold

In `docs/CHART-IDEAS.md`. The ones most likely to be broken by accident:

- American English, in comments as much as UI copy. No em-dashes.
- Genres display alphabetically, Other last (`GENRE_ALPHA`). The palette's
  `GENRE_ORDER` is a color-PRIORITY order and is not an axis order.
- "Other" is a catch-all, not an identity: never use its gray as an accent, and
  never name a computed complement "other" — it collides. Use "rest".
- Toggles use the pill switcher from `Toggle.tsx`, matching RollingRating.
- "No data" is `#eceae3` plus an ink outline, drawn per edge, inset, and only
  where a mark meets empty space.
- Axis ticks step at round intervals, and the step should follow the data. A
  fixed step put a filtered chart in the bottom sixth of its own plot.
- Medians are taken over categories that actually have data. Including the empty
  ones made the pace chart print "median 496.0".

## Still open

- `ChartTakeaway` under each stats section, matching the narrative sections.
- Splitting the one eight-chart story into the four beats in
  `thoughts/STATS-STORY-NARRATIVE.md`. One story shipped first so the swap
  machinery would exist and be testable; the four-beat structure is still the
  open editorial proposal.
- Viewing velocity has no legend of its own. It is a single gray series now, so
  there may be nothing to legend, but confirm.
- `upload_r2.py` gzips embeddings but has never run; credentials live only in
  GitHub secrets. It will run in the next scheduled Action.
