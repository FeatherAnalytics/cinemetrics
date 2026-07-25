# The stats story: signal, noise, and what it is actually about

Written 2026-07-25, after eight charts were built and measured. This is the
editorial pass: what to keep, what to cut, and what the story is FOR.

The charts are in good shape. The problem now is that they are eight answers
without a question. Below is what the data actually supports.

---

## The honest summary: most of this story is a null result

Three of the eight charts test whether something predicts my rating. All three
come back empty:

| Question | Result | Verdict |
|---|---|---|
| Does the month I watch predict my rating? | p = 0.401 | null |
| Does the weekday predict it? | p = 0.193 | null |
| Does genre predict it? | medians span 70 to 80 | effectively null |

That is not a failure. **It is the most interesting thing here**, and no chart
currently says it out loud. The finding is:

> **I rate almost everything between 3 and 4 stars, and nothing about WHEN or
> WHAT I watch moves that. What changes is how MUCH I watch, and that changes a
> lot.**

That sentence is the story. Every chart should either support it or go.

---

## Signal

Ranked by how much they would survive a reader with thirty seconds.

1. **The October cliff.** 131 watches in October against 38 in November: one film
   every 1.7 days, then one every 5.5. The sharpest adjacent contrast in the
   dataset, and it is a decision, not a season.
2. **The pace collapse.** 2020 and 2021 peaked at 146 and 145 watches. 2025
   finished at 64. Less than half, and the ratings did not move with it.
3. **Rewatching went from a habit to a third of everything.** 20.5% in 2020,
   **43.4%** in 2021, settling near a third. The lockdown year is visible in the
   data without anyone labeling it.
4. **Rewatching is CONCENTRATED, and nothing on the page shows it.** 206
   rewatches land on just **82 of 676 films**. Suspiria eight times, Midsommar
   and Sicario seven each. This is the best unshipped stat in the set.
5. **The lead changes hands mid-year.** At Mar 26 the standings are 2021, 2019,
   2022; by November they are 2020, 2021, 2019. Only visible on hover, which is
   backwards: it is the point of the chart.

## Noise

- **Ratings by genre (#11).** Seventeen box plots, ~90 marks, and every median
  lands on 70, 75 or 80 because my ratings are multiples of five. The spread
  across all seventeen genres is **10 points, half a star**. This is the highest
  ink-to-information ratio on the page by a wide margin. **Recommend cutting it**
  and replacing the finding with one sentence: "every genre I watch lands between
  3.5 and 4 stars." If it stays, sort by median and keep the top and bottom three.
- **The ANOVA captions.** Two charts each spend a line saying a test failed.
  One shared sentence in the story intro covers both, and covers #11 too.
- **The weekday chart (#2).** The trend is real (82 Monday to 153 Sunday,
  monotonic) but it is a fact about weekends, not about me. Weakest keeper.
- **Genre pairing's empty space (#10).** A 17x17 grid is 289 cells; 94 are
  populated and 20 of those are single films. The signal is the top eight pairs:
  Horror+Mystery (104), Horror+Thriller (88), Action+Adventure (82),
  Drama+Horror (82). Consider a ranked bar of the top pairs, with the matrix as
  the optional deep-dive.
- **Value labels under every bar.** In the monthly chart, twelve numbers restate
  twelve bar heights. Label the extremes and let the bars do the rest.

## The redundancy nobody has called yet

**#6 (rewatch mix by year) and #6b (viewing velocity by month) draw the same
series at two zoom levels.** This is the same argument that retired #5, which was
#6b minus the split. #6 earns its place only through the share label above each
column; the bars themselves are #6b aggregated. Either merge the share into #6b
as a hover readout, or accept two charts of one thing.

---

## Proposed story beats

Four beats, each one chart plus one sentence. Everything else is a deep-dive the
reader can reach but is not shown by default.

1. **"I watch in bursts, not habits."** October outdraws November three to one.
   → Pace by month, with October and November the only labeled bars.
2. **"The pandemic is the shape of this dataset."** 2020 and 2021 are the twin
   peaks; 2025 ran at 44% of that. → Viewings to date, with 2020/2021 in the
   accent and the rest chrome.
3. **"When I stopped finding films, I started returning to them."** Rewatch share
   from 20.5% to 43.4%, and 206 rewatches concentrated in 82 films: Suspiria
   eight times. → Viewing velocity, plus a "most returned to" list.
4. **"None of it changes what I think."** Month, weekday and genre all fail to
   predict the rating; everything lands 3 to 4 stars. → One stat panel, no chart.

Beat 4 is where the nulls go. Stated once, deliberately, they read as a finding.
Left as three separate captions under three charts, they read as three failures.

---

## Ink-ratio checklist

Applied per Storytelling With Data's "declutter" step. Cheapest wins first.

1. Drop the per-bar value labels where the axis already carries the scale.
2. One legend line per chart, not two. Several charts state the encoding twice,
   once in the strip and once in the blurb.
3. Blurbs are 2 to 3 sentences of construction detail. The reader needs the
   finding; the construction belongs in the code comments where it already is.
4. Gridlines to two per chart (zero and top), which several already do.
5. Gray everything that is not the point, accent only the thing being claimed.
   The recency ramp in #12 already does this; the bar charts do not.

## Open questions for you

- **Cut #11 outright, or reduce it?** I lean cut: half a star of spread across
  seventeen genres is a sentence, not a chart.
- **Is the "most rewatched films" list worth building?** It is the strongest stat
  in the set with no home, and it is a five-line component.
- **Do #6 and #6b both survive?** They are one finding at two zoom levels.
