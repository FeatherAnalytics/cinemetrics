# Handoff: stats charts, ready to become a story

Branch `feat/chart-prototypes`, pushed through `bdfa125`. No PR yet.

## Where things are

Eight statistical charts live in `web/src/components/stats/`, rendered together
at `/lab` by `StatsStoryPreview.tsx`. They are real components, not prototypes:
they take no props, read the explorer store, and cross-filter each other. The
old `components/lab/` prototypes are deleted.

Pure logic sits in `web/src/lib/statsChart.ts` (44 tests). 167 tests pass, tsc
and eslint clean.

## The goal for next session

Wire these into a stats story on the main page, and wire up the story elements
with them. Then wrap up `/lab` and move to the main page.

The plan of record is in `thoughts/STATS-STORY-SWAP.md`: add a `mode` field to
`ChartSection` in `ExplorerApp.tsx` so the stats story REPLACES the eight
narrative charts rather than adding to them. Story chips, the `StoryConfig`
entry and the filter rail are all still to do.

**Write reusable, functional code.** The charts already share `CategoryBars`,
`Toggle`, `pick.ts` and `statsChart.ts`; keep going that way rather than
one-off-ing the story wiring.

## Hover behavior

Cumulative watches and viewings to date have hover readouts already, but the
look and behavior do not match the rest of the page. Fix during the migration.

Every stats chart should get a hover element. Two rules: it must be visually and
behaviorally distinct from the story annotations, and it must show something
worth knowing rather than restating the axis.

## Story idea: Four Favs

Four favorite films, in order. Resolved and committed to
`web/src/lib/fourFavs.ts`:

| # | Film | tmdb_id |
|---|---|---|
| 1 | Raw (2016) | 393519 |
| 2 | Suspiria (2018) | 361292 |
| 3 | Paprika (2006) | 4977 |
| 4 | The Nice Guys (2016) | 290250 |

All four are in the watch history, rated 96 to 100, and all rewatched. Three of
the four already sit near the top of "what I go back to", so the story can lean
on that chart rather than needing its own.

## Narrative direction

`thoughts/STATS-STORY-NARRATIVE.md` has the editorial pass: what is signal, what
is noise, four proposed story beats with real numbers, and an ink-ratio
checklist. The headline finding is that month, weekday and genre all fail to
predict my rating, and everything lands between 3 and 4 stars. What changes is
how much I watch, not what I think of it.

## Conventions to hold

Written up in `docs/CHART-IDEAS.md`. The ones most likely to be broken by
accident:

- American English, in comments as much as UI copy. No em-dashes.
- Genres display alphabetically, Other last (`GENRE_ALPHA`). The palette's
  `GENRE_ORDER` is a color-priority order and is not an axis order.
- Toggles use the pill switcher from `Toggle.tsx`, matching RollingRating.
- No "click to select" hints; cross-filtering is the site's convention.
- "No data" is `#eceae3` plus an ink outline, drawn per edge, inset, and only
  where a mark meets empty space.
- Axis ticks step at round intervals, not shares of a total.

## Data traps that will bite

- **`rewatch` is three-state.** The 129 sheet-era rows never recorded it, so
  `false` there means unknown. Divide by rows that recorded the field.
- **42% of flagged rewatches (87 of 206) are films whose first viewing predates
  the dataset.** "Rewatches" and "returns visible in the data" are different
  numbers. Say which one you mean.
- **`liked` is three-state** the same way; filter nulls before any rate.
- **Watch dates are already Chicago calendar dates.** Never run them through a
  timezone conversion; it shifts every watch back a day.

## Still open

- Where "viewings to date" belongs: main page or stats story.
- `upload_r2.py` gzips embeddings but has never run; credentials live only in
  GitHub secrets. It will run in the next scheduled Action.
