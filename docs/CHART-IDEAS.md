# Chart Ideas

Working backlog. **Current** = charts on data already in the pipeline.
**Wishlist** = needs the Letterboxd export ingested first.

Status: `[ ]` idea · `[~]` building · `[x]` shipped or approved · `[-]` dropped

**Where things stand (2026-07-25).** Shipped to the main page: 3, 4, 8. Approved for
the stats story and sitting in `/lab` ready to promote: **5c, 6, 6b, 10, 11**.
Under review in `/lab`: 1, 2, **12** (viewings to date, new). Dropped: **5**
(superseded by 6b), 5b, 9, 10d.
Axis ticks step at ROUND intervals, not shares of the total: a scale reading
199/397/596 is arithmetic the reader should not have to do. Cumulative watches
steps by 100, viewings to date by 50 (`ticksEvery` / `ceilTo`).

**Genres display ALPHABETICALLY**, Other last (`GENRE_ALPHA`). The palette's
`GENRE_ORDER` is a color-PRIORITY order (Horror wins when a film carries several),
which is right for assigning a color and wrong for an axis, where a reader looks a
genre up by name.

**Toggles use the pill switcher** from "Warming up or wearing out" (`Toggle.tsx`).
Two treatments read as two different controls.

**No "click to select" hints.** Cross-filtering on click is the site's convention
and the cursor already says so; a hint per chart is one line of type each for
something the reader learns once.

**A working preview lives at `/lab`.** All eight promoted charts, real components
in `web/src/components/stats/` with pure helpers in `web/src/lib/statsChart.ts`
(67 tests): clicking any bar, segment, box, cell or year label cross-filters every
other chart and fills the same `SelectionPanel` the main page uses. Story chips
and the filter rail are not wired yet. The raw `LabCharts.tsx` prototypes are
DELETED; everything on the swap list now lives as a real component.

**The editorial pass is written up in `thoughts/STATS-STORY-NARRATIVE.md`**: what
is signal, what is noise, four proposed story beats, and the case for cutting #11.
Headline finding: three of the eight charts test whether something predicts my
rating, and all three come back null. That IS the story, and no chart says it yet.

Open decisions: where #12 belongs, whether #11 survives, and whether #6 and #6b
are one finding at two zoom levels.

The promotion route for the approved five is written up in
`thoughts/STATS-STORY-SWAP.md`: a `mode` field on `ChartSection` so the stats story
REPLACES the eight narrative charts rather than adding to them. Not wired in yet.
**Do not delete `web/src/components/lab/LabCharts.tsx` until it is** — the chart
bodies live there and nowhere else.

**Conventions.** No em-dashes in prose or UI copy. **American English throughout**,
in code comments as much as in UI copy: color not colour, gray not grey, centered not
centred, neighboring not neighbouring, labeled not labelled. The density ramp is crimson
`#c01023` fading to chrome gray `#b3b1a6`, never a genre color, so density cannot
read as a category; `#eceae3` means "not enough data". Bins are centered on their tick
values, never on the edges between them.

**"No data" is `#eceae3` PLUS an ink outline, drawn per EDGE and INSET.** The tint
alone is nearly invisible on an off-white page, so an unrecorded region read as empty
space rather than as a deliberate absence. Three rules, each learned the hard way:

- **Inset the stroke.** An SVG stroke straddles its path, so half sits outside the
  mark and an outlined shape measures larger than its plain neighbors. In a heatmap
  that reads as a cell-size encoding nobody meant. `insetRect` in `statsChart.ts`.
- **Draw edges, not boxes**, and only where the mark meets EMPTY space. Against a
  neighbor the fill difference already separates them, and two adjacent outlines put
  two strokes on the shared boundary, which reads as one heavy line. In a bar series
  that filled every inter-bar gap and turned the run into a solid block.
- **Never a separate traced line.** Adding a line mark to a bar chart mixes two mark
  types to say one thing; trace the staircase with the bars' own edges instead.

---

## Bugs

- `[ ]` **B1**, Keyword bar click shows only the clicked keyword; label reads `0.0`
  but the bar still renders a length.
  - **a.** Ideally show keywords that co-occur with the selected one, not just it alone.

---

## Cross-cutting constraint

- `[ ]` **X1. Don't clutter the page.** Adding everything below would overwhelm.
  Options: collapsible sections hidden on load, or simply being picky about what ships.
  - **a.** Leaning picky: the site's strength is that each chart carries a story. A
    toggle-heavy dashboard trades that for density.
  - **b.** Middle path: charts that only make sense in a narrative stay *inside* the
    relevant story (e.g. #7a lives in Spooktober), rather than on the main page.
  - **c.** A "story" that focuses on stats, but this one would replace entire charts with statistics-midned charts. The stats are the story.

---

## Current data

- `[~]` **1. Monthly watch distribution**: bar chart. Built in `/lab`. **Watch count
  only**, with a dashed gray line at the median month.
  - **a.** Show R² against rating only if significant. **MEASURED: not significant.**
    eta² = 0.0145, F(11, 782) = 1.05, **p = 0.401**, n = 794. No effect size printed.
  - **b.** ⚠️ **R² is the wrong statistic here and was not used.** Month is a cyclic
    category, not a continuous quantity: regressing rating on a month index asserts
    that December is twelve times January, and misses non-monotonic patterns, which
    is precisely the shape expected when October is the interesting month. The test
    is a one-way **ANOVA**; eta² is the share of rating variance explained by group
    membership and is the direct categorical analogue of R², so it fills the same
    slot. Same reasoning applies to #2.
  - **c.** **The rating overlay is REMOVED from both #1 and #2**, resolving the open
    question that was here. It tested null in both, so it drew a shape the data does
    not support and cost a second axis to do it. The one-line ANOVA caption stays:
    "and rating does not move" is worth stating in words once, just not in ink.
  - **d.** The reference line is the **median** bucket, not the mean. With a spike the
    size of October the mean is dragged above most of the months it is supposed to
    baseline; the median answers "what does a typical month look like". It is drawn as
    a **y-axis tick** reading "median 64" in the axis gutter, after an inline label at
    the left of the line proved unreadable: it landed on top of the January bar and was
    gray-on-gray. As a tick it reads as what it is, a value on the scale, and it can
    never overlap a mark.
  - **f.** ✅ **Per-day-of-month version added, shown under the raw count.** February is
    up to three days shorter than January, so a raw count quietly penalizes it. The
    denominator is **not** a flat 31/30/28: it is the number of days of each calendar
    month that actually fall inside the observation window, counted by walking every
    real date from the first watch to the last. That gets leap days right for free
    (Feb 29 2020 and 2024 are simply days that happened) and also handles the partial
    months at both ends, where January 2019 is short 13 days and the final month is
    still running. A flat divisor would credit those months with days never observed.
  - **g.** **The pace is labeled as its reciprocal, "1 per 1.7d", not "0.60/day".**
    Reads far more naturally. ⚠️ Only the LABEL is inverted: bar height stays the
    rate, so taller still means more watching and this chart reads the same direction
    as the raw counts above it. Plotting days-per-film as height would flip that, and
    an inverted axis fighting the reader's intuition is exactly what sank #5b.
    Oct 1 per 1.7d, Apr and Jan 1 per 3.1d, Feb 1 per 4.6d, Mar 1 per 5.2d,
    Nov 1 per 5.5d. Normalizing lifts February above March, which the raw counts
    (49 vs 48) hide.
  - **h.** The axis gutter sizes to its widest label rather than a fixed width:
    "median 64" and "median 1 per 3.7d" differ by ~40px and the fixed version clipped
    the longer one.
  - **e.** **Story hook for the stats story:** October is the peak at **131** and
    November the floor at **38**, back to back. A 3.4× cliff between neighboring
    months, and the sharpest adjacent contrast anywhere in the chart. Ties directly
    into Spooktober (#7) and the existing note about the October 2020 grind.

- `[~]` **2. Day-of-week watch distribution**: bar chart. Built in `/lab`, same
  construction as #1, Monday first so the weekend sits together at the right.
  - **a.** Show R² against rating only if significant. **MEASURED: not significant.**
    eta² = 0.0109, F(6, 787) = 1.45, **p = 0.193**, n = 794. Nothing quoted.
  - **b.** **Counts rise monotonically Mon→Sun**: 82, 93, 94, 106, 128, 138, 153.
    Sunday carries 87% more watches than Monday. This is the cleanest single trend in
    either chart and needs no statistical test to carry it.
  - **c.** Sat and Sun sit on one flat `#eceae3` tint behind the bars: no border, no
    second color, one band rather than two, so it groups the weekend without
    competing with the bars it is grouping.
  - **e.** **View count only. The pace version was built and dropped.** Unlike #1
    there is nothing to normalize away: every weekday recurs almost the same number of
    times across seven years, where months differ by up to three days each. It
    redrew the identical shape (0.21 Mon rising to 0.39 Sun) and earned no space.
  - **d.** ⚠️ **Timezone: Chicago, and that means NO conversion.** `watched_date`
    comes from Letterboxd's `letterboxd:watchedDate`, a bare `YYYY-MM-DD` with no
    timestamp, picked by the user in local time and stored verbatim through ingest.
    **The stored string already IS the Chicago calendar date.** Running it through a
    UTC→America/Chicago conversion would be the bug, not the fix:
    `new Date("2024-10-15")` is midnight UTC, which is 19:00 on the **14th** in
    Chicago, so every watch would shift back a day and the whole weekday
    distribution would rotate by one. `chicagoParts()` parses the components off the
    string so no `Date` timezone semantics can get in and do that.

- `[x]` **3. Me vs critics, rebinned.** SHIPPED to the main page
  (`ResidualDotStack.tsx`). One column per half-star, dots and genre coloring kept.
  - **a.** ⚠️ Copy and story beats around it still need reworking.
  - **b.** Bins are CENTERED on the half-star marks. Edge-binning put each column on a
    quarter-star, half a step off its own axis label, which is where the stray "0.3"
    ticks came from. Column x is derived from the same mapping the ticks use.
  - **c.** Dots pack into a grid rather than one per row. Half-star bins are wide, and
    single-file stacking made the modal column ~880px tall; the chart is now 130px.
  - **d.** Covers all 794 watches, not 665, now that sheet-era stars are derived (D2).

- `[x]` **4. Stat panel subtexts.** SHIPPED (`StatBar.tsx`, `stats.ts`).
  - **a.** Watches, % that were rewatches
  - **b.** Runtime, average film length
  - **c.** Avg rating, `±N sd`. Labeled "sd" explicitly because the headline figure
    already carries a bare ±, which is the confidence interval of the mean. Different
    quantity, so a shared symbol would mislead.

- `[-]` **5. Watches-per-day barcode. DROPPED**, code deleted from `/lab`.
  - **a.** 6b is this chart with the first/rewatch split stacked inside it, so 6b's
    total height at any x *is* 5's value. Everything 5 showed, 6b shows too, plus
    composition, so shipping both drew the same curve twice. **6b inherits the name
    "Viewing velocity".**
  - **b.** ✅ **Warmup bug found and fixed.** The trailing mean divided by
    `min(i+1, win)`, so day one was the raw count for that day. Day one is a bulk
    sheet-era entry, roughly 30x any genuine 30-day mean, so it took the peak of the
    chart and squashed every real run into the bottom third. Now the first `win-1`
    days are DROPPED, matching the convention RollingRating already set ("lines start
    at the 10th watch, no partial-window noise"). Applied to 5 and 6b both.

- `[-]` **5b. Viewing velocity: one film every N days.** **DROPPED**, code deleted
  from `/lab`. The reciprocal of the rate reads more naturally than a fraction in
  *prose*, but never became legible as a chart: the inverted axis fought the
  intuition it was meant to serve, and gaps longer than the window rendered as
  absence, so a drought and a missing series looked identical. #5 covers the same
  question directly and #6b covers the split version. The name "Viewing velocity"
  moves to #5.

- `[~]` **12. Viewings to date.** NEW, built in `/lab`. Line chart, one line per
  calendar year, y = watches accumulated so far that year, x = calendar date.
  - **a.** Restarts at zero every January, so the question is *"am I ahead of last
    year at this point?"* rather than "how much in total". That is the axis #5c does
    not have: #5c stacks the running total across the whole history and never lets two
    years be compared at the same point in their own cycle.
  - **b.** Each line stops at that year's last watch instead of running flat to
    December, which is what makes the current part-year read as incomplete rather than
    as a collapse. 2026 ends mid-July at 31.
  - **c.** ⚠️ **Leap-day handling.** Dates are aligned on a fixed **366-slot** frame
    using leap-year cumulative offsets, so March 1 sits at the same x in every year and
    common years simply never use slot 59. Indexing by naive days-since-January-1 would
    slide every date after February back by one in common years, so the lines would
    compare the wrong calendar days against each other.
  - **d.** The right margin is a **table, not scattered annotations.** Rows are
    EVENLY spaced rather than parked at each line's endpoint, so the eye runs straight
    down them; irregular gaps made scanning a series of small vertical jumps. Year and
    count are separate `<text>` elements at fixed x with the count right-aligned,
    because one `{year} {count}` string lets a proportional font shift the count
    sideways row to row, which is the same scanning problem one level down. Ordering
    is by value, the same order the endpoints appear in, so nothing is lost by
    detaching them. No leader lines: eight of them would be eight marks carrying no
    data.
  - **g.** ✅ **Hover makes the margin a standings table.** A crosshair follows the
    cursor, every row reads that year's total AT the hovered calendar date, and the
    rows **resort live**, highest first, so dragging across the year shows the lead
    changing hands. At Mar 26 the order is 2021, 2019, 2022, 2023, 2020; by November
    it is 2020, 2021, 2019, 2024. Nothing like that is visible in the final standings.
  - **h.** A year whose data has run out **holds its last value** rather than dropping
    out, which is the "if I watched nothing else this year" reading, and is drawn at
    half opacity to mark that it is no longer a same-date comparison. Without it the
    current part-year vanished from the table exactly when comparing it is most
    interesting.
  - **e.** Recency ramp on the house crimson-to-chrome scale, current year crimson and
    older years fading back. Never a genre color, so a year cannot read as a genre.
  - **f.** Reads: 2020 (146) and 2021 (145) are the peak years and nearly identical;
    2019 is 131 despite starting January 14. Recent years run well below, 2025 at 64.
    Undecided whether this belongs on the main page or in the stats story.

- `[x]` **5c. Cumulative watches, stacked by genre.** APPROVED for the stats story.
  Built in `/lab`, ready to promote.
  - **d.** ✅ **DONE: hover updates the legend numbers.** Each band now reads its
    cumulative count AT the hovered month, with a crosshair, instead of only ever
    showing the final total the chart already draws.
  - **e.** ✅ **DONE: the breakdown follows the filter.** Unfiltered it stacks by
    genre. With any filter active it collapses to two bands, matching against
    everything else, so the chart answers the question the filter just asked instead
    of redrawing six genres with five of them empty. A single selected genre colors
    the matching band with its own genre color; any other filter gets the accent. The
    "other" band is chrome gray, never a genre color, so it cannot read as a category.
  - **a.** The best of the three time charts: rate is noisy because daily counts are
    almost all 0 or 1, so 5 and 5b each need a smoothing decision. A cumulative view
    needs none. Slope carries rate, band thickness carries composition.
  - **b.** Uses `GENRE_COLORS`/`primaryGenre`, so it matches the site palette.
  - **c.** Genre is only the demo breakdown. Decade, country, rating band or
    liked/not stack identically.

- `[x]` **6. First watches vs rewatches over time.** APPROVED for the stats story.
  Was: is the proportion meaningfully different as a stacked percentage chart, and
  which framing is most legible? Both were built in `/lab` and one won.
  - **a.** **RESOLVED: volume wins, the 100% stacked version is deleted.** Share
    redrew a 31-watch part year at the same height as a 146-watch year, which is
    exactly the misreading the chart should prevent. Volume keeps the absolute counts
    and carries the share as a per-column label, so both readings survive in one
    chart instead of two.
  - **b.** ⚠️ **This chart surfaced a data-quality bug: see D5.** The 129 sheet-era
    rows carry NO rewatch flag, so 2019 rendered as 1.5% rewatches, an artifact of
    the source rather than a fact about the year. Sheet-era rows now stack as their
    own `#eceae3` segment **with an ink outline** (the house "no data" treatment, see
    Conventions), are excluded from every percentage, and their column is labeled
    "no data".
  - **c.** The real series, Letterboxd era only: 2020 20.5%, 2021 **43.4%**, 2022
    22.3%, 2023 26.2%, 2024 36.4%, 2025 34.4%, 2026 32.3% (part year). The 2021 peak
    is the story beat; the recent floor sits around a third.
  - **d.** A percentage is suppressed below 10 rows of known state, so a part year or
    a sparse filter cannot print a confident-looking number off two films.

- `[x]` **6b. First vs rewatch at daily resolution.** APPROVED for the stats story,
  and preferred over #5, which it supersedes. #5's granularity carrying #6's split.
  Built in `/lab`.
  - **a.** The point: #6 answers "has the mix changed" at one bar per year, which
    shows the 2021 peak and nothing about its *shape*. This keeps the 30-day trailing
    mean that makes #5 legible and stacks the two series inside it, so a rewatch run
    reads as a crimson bulge in the week it happened rather than being averaged into
    an annual number.
  - **b.** Sheet-era months stack as their own `#eceae3` band at full height: the
    watches are real, only the split is unrecorded (D5). The band is traced as a
    **staircase using the bars' own edges**: a top edge per bar, and a vertical only
    where a bar stands taller than the neighbor it meets. Outlining each bar as a box
    put strokes down both sides of every 0.6px inter-bar gap, which filled the gaps
    and turned the whole 2019 run into a solid dark block. See Conventions.
  - **c.** ⚠️ The three series MUST share one timeline. Running the daily-count
    helper on each subset separately yields three arrays each starting at its own
    first watch, so index *i* means a different calendar day in each and the stack is
    silently wrong. They are indexed off a single origin. Verified: 459 first + 206
    rewatch + 129 unknown = 794, no day carries both known and unknown, and the sheet
    era (last day index 337) strictly precedes the known era (first index 341).
  - **d.** ✅ **DECIDED: stacked monthly bars, no smoothing.** A calendar month is a
    real unit rather than a window someone had to choose, so nothing needs defending,
    and unlike weeks the bars line up with the year ticks. Peak is 34 watches in a
    month. Rejected on the way here, all now deleted: a 10-day mean (fragmented both
    bands into slivers), weekly bars (did not align to year boundaries), and a 30-day
    trailing mean (smooth, but the window was a choice needing justification).
  - **e.** ⚠️ **No-data is outlined on the BARS, not traced as a line.** The monthly
    version briefly kept the 30-day chart's approach of stroking one path along the
    unknown region's upper edge. That was wrong here: adding a line mark to a bar
    chart mixes two mark types to say one thing. Monthly bars are ~7px wide, which is
    plenty of room for a per-bar stroke, so the region needs no separate edge. The
    traced-path trick is only justified when columns are sub-pixel and per-bar strokes
    would merge into a solid block.
  - **f.** Monthly degrades more gracefully than any smoothed version under an active
    filter: a thin month is honestly thin, rather than an artifact of a window chosen
    against all 794 watches.

- `[-]` **7. Streak emphasis in swimlanes** for the Octobers with ≥1 film/day, gradually darken the background around streaks, or use the crimson accent.
  - **a.** Possibly Spooktober-story-only: a popup charting each film and its rating
    (same bins as #3), plus a line tracking the running average across the streak,
    ending at the streak's overall average.

- `[x]` **8. "What travels well".** SHIPPED into `CountryBars.tsx` on the main page.
  The per-country residual was already computed in `countryStats.ts` and shown only
  as a number; it is now a mirrored bar.
  - **a.** Films grow rightward from the country name, deviation grows leftward from
    the right edge, so the two series converge instead of diverging from a spine.
  - **b.** Both bars in a row share the genre color. The sign lives in the value
    label rather than in a second color encoding.
  - **c.** ⚠️ The residual bar shows MAGNITUDE only, so `+0.5` and `-0.5` render
    identically and only the number distinguishes them. Open question whether that
    matters enough to change.
  - **d.** Dropping the fixed value column bought 72px of track width.

- `[-]` **9. Critics vs deviation.** DROPPED. Reframed from a scatter to a binned
  distribution as intended, but the critics model rarely predicts outside 2.5 to 4.0
  stars, so only three or four bands ever populate and there is no story in them.

- `[x]` **10. Genre pairing heatmap.** APPROVED for the stats story. Built in `/lab`,
  ready to promote. Films do carry multiple genres, so pairing works.
  - **a.** Self-pairs excluded, so every cell is a genuine combination. Left in, they
    just restated the single-genre count and dominated the scale.
  - **b.** Numbers are bold and sized by mean rating: 10% larger than the base at the
    floor, 100% larger at the top.
  - **e.** **Cells butt together, no gutter.** The 2px gap was reading as a white grid
    drawn over the data, which fought the density ramp the chart is built on. Adjacent
    cells now form continuous regions, which is what a heatmap is for. Single-film
    cells keep their ink outline (the no-data standard), and that now does the
    separating work the gutter was doing badly.
  - **f.** ⚠️ **No-data outlines are drawn PER EDGE, and only against empty space.**
    Three passes to get here. Outlining whole cells laid two strokes on every shared
    boundary, reading as one heavy line. Drawing each shared edge once fixed the
    weight but still ruled lines between cells that did not need separating. The rule
    that works: an edge appears only where the cell has NO neighboring cell at all,
    since against a neighbor the fill difference already does the separating. A
    no-data cell surrounded by data now carries no outline, just its pale fill.
  - **c.** Pairs backed by ONE film render in `#eceae3` and are held out of the color
    and font domains. 20 of 94 pairs are singletons and their ratings span 50 to 80,
    which was flattening the ramp for the 74 pairs carrying real evidence. Note `n=1`
    is unrelated to self-pairs: it means a rare genuine combination.
  - **d.** `[-]` A variant sized by count and colored by rating was tried and dropped.
    Treemap-style sizing (finviz) is not available in a matrix layout, since a treemap
    discards the axes that make "which genre pairs with which" readable.

- `[x]` **11. Ratings by genre.** APPROVED for the stats story. Built in `/lab`, ready
  to promote. Vertical box plots, alphabetical, crimson median against a gray box,
  whiskers drawn behind an opaque box so only the tails outside the IQR show.
  - **a.** **Standard Tukey**, after 5/95 and 10/90 percentile whiskers were both
    tried and dropped. Whiskers reach the furthest actual value within 1.5 IQR of the
    box; anything past that is an outlier drawn as its own hollow dot. Fixed
    percentile whiskers look exactly like a box plot while meaning something else,
    and by construction they can never produce an outlier dot, which is why none were
    appearing. Tukey needs no caption explaining the ends: a reader who knows box
    plots already knows.
  - **b.** **n sits on top, above the 5-star tick, bold.** It was tried under the
    rotated genre label first, where it was the fourth thing the eye hit and never
    lined up with the label it belonged to. On top it forms its own scannable row and
    the rotated genre labels stay a single clean band at the bottom.

---

## Wishlist: needs export data

Downloaded via `scripts/fetch_export.py`, not yet ingested. Available: watchlist (136),
likes (239), 11 lists (~600 memberships), full diary (665), `watched.csv` (585),
`ratings.csv` (585).

Note: `ratings.csv`, `likes/films.csv` and `watched.csv` all key on the same *film* URI,
so they join to each other exactly. Only `diary.csv` uses a per-entry URI. Anything
combining those three needs no tmdb resolution.

### Watchlist

- `[ ]` **W1. Watchlist waterfall over time**
  - **a.** Negative values when a watchlisted film gets viewed.
  - **b.** *Dwell time*: how long films sit before being watched; median time-to-watch.
  - **c.** *Conversion rate*: share of everything ever watchlisted that got watched.
  - **d.** *Abandonment*: films sitting untouched for years. The live watchlist is 136
    entries but the "Watchlist" list export holds 264, so there's history to mine.

- `[-]` **W2. Planned vs spontaneous**: do watchlisted films rate differently than
  films watched without planning? Tests whether anticipation tracks satisfaction.
  - removed because sometimes I remove a film from the watchlist after seeing it and sometimes I don't. unless we can get historical data for all films that were ever on the watchlist, even after they were removed. 

### Obscurity

- `[x]` **W13 MEASURED: yes, and in the opposite direction to the hypothesis.**
  `log10(imdb_votes)` vs rating, one row per film (676):

  ```
  Pearson r = +0.301   r² = 0.091   p = 1.2e-15
  Spearman ρ = +0.309              p = 2.2e-16
  ```

  | band | films | mean rating | like rate |
  |---|---:|---:|---:|
  | <1K | 7 | 54.3 | 0% |
  | 1K–10K | 69 | 66.7 | 28% |
  | 10K–50K | 116 | 67.4 | 26% |
  | 50K–200K | 217 | 71.0 | 34% |
  | 200K–500K | 168 | 74.8 | 45% |
  | 500K–1M | 76 | 76.8 | 36% |
  | >1M | 23 | 79.5 | 61% |

  - **POSITIVE correlation: popular films rate HIGHER.** No contrarian discovery
    bias: monotonic across every band, a 25-point spread, and likes track it.
  - Effect size sits between content features (R² 0.018) and critics-only (0.203):
    5× the former, ~half the latter. Worth adding `log10(votes)` as a recommender
    feature (was W13d).
  - Significant and positive in 11 of 13 genres (n≥25). Strongest Romance (r=0.442),
    Fantasy, Comedy. Null for Biography and Animation.
  - ⚠️ **Caption it carefully.** The obscure tail is *Grandmother's Farm* (106 votes,
    rated 20), *Hack-O-Lantern*, *It Cuts Deep*: deliberate obscure-horror-schlock
    watching. The finding is likely "I knowingly watch obscure films that are probably
    bad", not "obscurity depresses my ratings". Popular films are also pre-filtered by
    consensus. Framing this as discovery bias would be wrong.

- `[ ]` **W13-chart. Build the mirrored bars** from the band table above.
  - **a.** ✅ **No new data needed.** `film_enrichment.csv` already carries `imdb_votes`,
    plus `box_office`, `budget` and `revenue`. `imdb_votes` is the best obscurity proxy
    we have: it spans orders of magnitude and is stable over time, unlike TMDB
    `popularity` (a volatile current-trend score). The resolver's cached TMDB searches
    also give `vote_count` for free.
  - **b.** *Chart:* x = `log10(imdb_votes)` binned by order of magnitude, y = mean
    rating per bin. Mirror it with watch count per bin, in the style of the
    watches-per-country pair: so one side reads "how much I watch at this obscurity
    level" and the other "how much I like it there".
  - **c.** *Statistic:* correlation of `log10(votes)` against rating, overall and per
    genre. Report only if significant, per the #1/#2 convention.
  - **d.** Feeds `recommend/taste.py`: content features scored R² 0.018 vs 0.203 for
    critics-only. `log(votes)` is a cheap, already-available feature: worth testing
    whether it improves that baseline before any heavier modelling.
  - **e.** ⚠️ Confounder: obscure films are disproportionately ones I *chose*
    deliberately, while popular films include social/obligation watches. The effect may
    be selection, not taste. The watchlist flag (W2) helps separate the two.
  - **f.** `imdb_votes` is the only obscurity source we will use: see W14 for why
    Letterboxd's own ranking is off the table.

- `[ ]` **W14. Two kinds of popularity: and the gap between them.** `imdb_votes`
  measures *general public* awareness; Letterboxd rank measures *film-community*
  standing. They are different constructs, and the divergence is its own signal.
  - **a.** *The 2×2:* high IMDb / low Letterboxd = mainstream the community ignores.
    Low IMDb / high Letterboxd = film-nerd canon the public never saw. The off-diagonal
    quadrants are where taste actually lives.
  - **b.** *Which do my ratings track?* Correlate rating against each metric separately.
    If ratings follow Letterboxd rank more closely than IMDb votes, that says something
    real about whose consensus I share.
  - **c.** *Where does my watch count cluster?* Possibly at some ratio of the two rather
    than at an absolute level of either: e.g. consistently drawn to films punching
    above their public profile.
  - **d.** `[-]` **Dropped: not obtainable within Letterboxd's ToS.** Letterboxd
    publishes no per-film popularity number; rank exists only as position in the
    ordered listing at `/films/ajax/popular/`, and **every** route to it is behind a
    Cloudflare challenge (403 on the ajax endpoint, the plain page, and `/by/popular/`;
    `/film/{slug}/fans/` too). Individual film pages return 200, so they are shielding
    the bulk-enumerable endpoints deliberately. Reaching them needs TLS-fingerprint
    impersonation (`curl_cffi`): a circumvention we chose not to do. `imdb_votes`
    (W13) is the obscurity measure; the two-kinds-of-popularity comparison is off the
    table unless Letterboxd exposes the data another way.

### Official Letterboxd lists: reference data

Curated lists worth mining for *other* charts. All are top-N, so they describe the
famous end of the distribution: useful as benchmarks and calibration, **not** as an
obscurity source (our obscure films appear in none of them).

- `[ ]` **W17. Letterboxd's Top 500 Films**, [boxd.it/8HjM](https://boxd.it/8HjM).
  Ranked by **average member rating**, not popularity. Updated ~monthly.
  - **a.** *"How much of the canon have I seen?"*: a completion stat, and a natural
    story beat.
  - **b.** Where my rating diverges from the community consensus on canonised films.
  - **c.** ⚠️ Do not confuse with popularity rank. Different ordering entirely.

- `[ ]` **W18. Fastest to One Million Watched**, [boxd.it/V2tim](https://boxd.it/V2tim). Days from wide release to 1M members
  watched. A direct *hype velocity* measure: a much better proxy for W3 than Google
  Trends, and it needs no unofficial API. Only 100 films, all blockbusters.

- `[ ]` **W19. Most Fans on Letterboxd (2022)**, [boxd.it/gCB7Y](https://boxd.it/gCB7Y). Top 100 by fan count.
  - **a.** Confirms where the number lives: *"displayed in the 'Ratings' section on a
    film's page"*.
  - **b.** A variant ranks by **fans ÷ members watched**: the normalized cult metric.
    Devotion per viewer, which is the signal W14 is really after.
  - **c.** Use these known values to calibrate the abbreviated strings the film page
    serves (`14K fans`).

- `[ ]` **W20. Most Obsessively Rewatched Horror (2023)**, [boxd.it/pntCU](https://boxd.it/pntCU). 250 horror films logged 5+ times by the most
  members. Pairs with the rewatch work (#6) and Spooktober (#7): *is what I rewatch
  what the community rewatches?* Genre-limited, but horror is a large share of this
  library.

### Hype-watching

- `[ ]` **W3. Google Trends vs watch date**: chart search interest for a film against
  when it was watched, as a proxy for "hype-watches". Likely captures release-date
  effects plus pop-culture pull on viewing.
  - **a.** ⚠️ Feasibility: Google Trends has no official API. `pytrends` is unofficial,
    rate-limited, and breaks periodically. Values are *relative* (0–100, normalized per
    query), so cross-film comparison needs a shared reference term.
  - **b.** Cheaper proxy worth testing first: `days between release and watch`, already
    derivable from existing data. If that alone explains the pattern, Trends adds cost
    without insight.
  - **c.** Alternative source: TMDB `popularity` is time-varying but not historical: it
    can't be backfilled, only sampled going forward.

### Likes

✅ **W4 answered: likes are NOT redundant. This section is worth building.**

- `[x]` **W4. Is a like just a rating threshold?** No. Measured on the export
  (`ratings.csv` ⋈ `likes/films.csv`, joined on film URI: no tmdb resolution needed):

  | stars | liked | total | rate |
  |------:|------:|------:|-----:|
  | ≤2.5 | 0 | 58 | 0.0% |
  | 3.0 | 3 | 111 | 2.7% |
  | 3.5 | 41 | 163 | 25.2% |
  | 4.0 | 122 | 178 | 68.5% |
  | 4.5 | 57 | 59 | 96.6% |
  | 5.0 | 16 | 16 | 100% |

  - **a.** Point-biserial r = **0.640** (r² = 0.409): rating explains ~41% of whether
    a film is hearted; **~59% is something else**. Point-biserial is the correct
    statistic for binary-vs-continuous; a plain R² would mislead here.
  - **b.** Best possible single threshold is `≥4.0`, and it agrees with actual likes only
    **82.6%** of the time. A pure threshold model fails on 1 in 6 films.
  - **c.** **All signal is in the middle.** ≤2.5 → 0%, ≥4.5 → 96.6–100%. The heart and
    the star agree at the extremes and diverge across 3.0–4.0, where **77% of films sit**.
  - **d.** Within the ≥4.0 bucket: **58 films (22.9%) are rated highly but not liked.**
    Rating barely varies inside that bucket, so an R² against rating there is ~0 by
    construction: the live question is what *else* separates them → W7.

- `[ ]` **W5. Heart vs head (2×2)**: the most personal cut in the dataset, and W4 sized
  it: **102 films** land in the divergent quadrants.
  - rated ≥4.0, *not* liked → "respected it, left me cold", **58 films**
  - rated <4.0, liked → "flawed, but it's mine", **44 films** (41 of them at 3.5)
  - Pairs with the critics-residual chart: one axis you-vs-critics, other heart-vs-head.

- `[ ]` **W6. Affection rate** by genre / director / decade: what share of what you
  watched got hearted. Diverges from mean rating; a genre can score lower but be
  hearted more often.

- `[ ]` **W7. Likes as a recommender target**, `recommend/taste.py` found content
  features don't predict ratings (R² 0.018 vs 0.203 critics-only). A binary like is a
  far easier target than 0–100 regression, so classification may find signal where
  regression failed. Cross-validate against the base rate before trusting it.
  - **a.** Sharpest version, straight out of W4d: restrict to the 253 films rated ≥4.0
    and predict which 58 were *not* liked. Rating is held ~constant, so anything the
    model finds is genuinely non-rating signal. Base rate 77.1%: beat that or discard.

### Posters

- `[ ]` **W15. Chromatic barcode: one stripe per watch.** A thin vertical stripe per
  watch in date order, colored by that film's dominant poster color. The existing
  streaks-and-slumps barcode (#5) rendered in color; the Octobers should visibly
  darken toward reds and blacks.
  - **a.** ✅ **Costs almost nothing to ship.** Extract the dominant color at build
    time and store one hex per film: 676 × ~7 bytes ≈ 5 KB in the JSON. **No images
    are loaded at runtime at all**: the chart is just colored rects.
  - **b.** Needs `poster_path`, which TMDB already returns and which is cached for
    candidates in `data/raw/tmdb_candidates/`. Only the 676 watched films need
    fetching. New script: `scripts/fetch_posters.py` (fetch → downscale → dominant
    color → store hex).
  - **c.** Dominant color needs care: naive averaging yields mud. Prefer k-means on a
    downscaled thumbnail, or the most-saturated cluster, so a poster reads as its
    identity rather than as gray.
  - **d.** Extensions once the colors exist: mean hue per month/season as a ribbon;
    a Spooktober palette tying into #7 and W9.

- `[ ]` **W16. Poster wall in viewing order**: every watch as a poster, chronological.
  - **a.** ⚠️ 794 posters at w92 is ~6 MB: too heavy for a static GH Pages bundle as
    individual images. Generate **one composite PNG at build time** (Pillow, in the
    pipeline) so it is a single cacheable request.
  - **b.** Additive to W15, not a prerequisite. W15 delivers most of the visual payoff
    at ~0.1% of the weight; build this only if the wall itself is the point.
  - **c.** ⚠️ TMDB's terms require attribution for poster use: the footer needs a
    credit if it lacks one.

### Lists

- `[ ]` **W8. List membership as a filter/facet** across existing charts.

- `[-]` **W9. Spooktober: planned vs executed**, `spooktember-2023` (61 films) and
  `spooktober-2024` (79) are the *plan*; the October streaks are the *execution*.
  Their overlap is a follow-through rate. Strongest story idea here, and the data
  exists nowhere but the export. Ties directly into #7.

- `[-]` **W10. `horror-watchlist` (103 films)** as a standing themed cohort.

- `[-]` **W11. List position**: dropped; ordering isn't used meaningfully.

---

## Data-quality notes

- `[x]` **D1. `release_year` repaired**, 55 rows corrected from the export
  (`scripts/repair_release_years.py`). film_log inherited later years from the Google
  Sheet; 48 were off by exactly +1, consistent with streaming/regional release dates.
  Corrections propagate by `tmdb_id`, since `dim_film.sql` does
  `any_value(release_year) group by tmdb_id`: two years for one film would make that
  model nondeterministic. Affects anything keyed on release year, incl. decades.

- `[x]` **D2. Sheet era has no stars, but they derive cleanly.** DONE, derived in
  `stg_film_log.sql`; star-binned charts now cover all 794 watches. 129 of 794 rows
  (2019-01-14 → 2019-12-20, pre-Letterboxd) have `my_rating` but no `star_rating`.
  Verified: every sheet value is a multiple of 10 (`20, 30 … 100`), so `my_rating / 20`
  lands exactly on `1.0, 1.5 … 5.0` with **zero invalid half-stars**. The 1–10 sheet
  scale maps perfectly onto Letterboxd's vocabulary.
  - **a.** Fix once in `stg_film_log.sql`, `coalesce(star_rating, my_rating / 20)`, rather than per chart. Star-binned charts then cover all 794 watches, not 665.
  - **b.** Caveat: derived stars are inferred, not recorded. If any chart needs to
    distinguish "rated 4★" from "rated 80/100 and converted", keep the raw column too.

- `[x]` **D3. Rewatches predate the data**: some films flagged `is_rewatch` were first
  seen before either the sheet or Letterboxd existed. A rewatch with no prior row is
  *correct*; never infer "first watch" from earliest-row-in-data.
  - **a.** ⚠️ **MEASURED, and it is large: 87 of the 206 flagged rewatches (42%) are
    films with only ONE row in the dataset.** Their first viewing is not here at all.
    So "206 rewatches" and "returns visible in the data" are different quantities:
    82 films are seen 2+ times, totalling 200 viewings, which is **118 actual
    returns**. Any chart counting returns must say which of the two it means. The
    "what I go back to" charts count viewings present in the data; the rewatch SHARE
    stat counts the flag.

- **D4. Ratings live in `ratings.csv`, not `diary.csv`**: the per-entry `Rating` in the
  diary is frequently blank even when the film is rated (e.g. Belzebuth: diary blank,
  `ratings.csv` 4). Never sync ratings from the diary; it would destroy real data.

- `[ ]` **D5. `rewatch` is three-state, exactly like `liked`.** Found while building
  #6. The 129 sheet-era rows carry **zero** `rewatch: true` flags, against **31.0%**
  (206 of 665) across the Letterboxd era. The sheet did not record the field at all,
  so `false` there means **UNKNOWN**, not "not a rewatch".
  - **a.** Measured: rows before the first Letterboxd watch (2019-12-21) are 129, of
    which 0 are rewatches. The only two 2019 rewatches are the first two Letterboxd
    rows, 2019-12-21 and 2019-12-22. The boundary is sharp, not gradual.
  - **b.** ✅ **FIXED in `stats.ts`.** This was a live bug in shipped code, not just a
    lab finding: `computeRewatchShare` divided by `watches.length`, so the #4a
    stat-panel figure read **206/794 = 25.9%** when the true rate over rows that
    recorded the field is **206/665 = 31.0%**. A 5.1-point understatement, by exactly
    the mechanism already documented for `liked` (which understated the affection rate
    by 7.5 points). Now filters to known-state rows before dividing and returns null
    if none remain. Covered by 6 new tests in `stats.test.ts`, including the
    regression case where 4 sheet-era rows would otherwise dilute 1 rewatch to 20%.
    Note the test fixture defaults `liked: null`, so any new rewatch-share test must
    set it explicitly or it is testing the unknown-state path by accident.
  - **c.** Era test used in `/lab`, derived rather than hardcoded: the earliest watch
    with non-null `liked` is the first Letterboxd row, so everything before it is
    sheet era. Avoids a magic date, and `liked` is already documented as null only
    for those rows.
  - **d.** Distinct from D3. D3 says a rewatch with no earlier row is *correct*; D5
    says a sheet-era non-rewatch is *unrecorded*. Both are true and neither implies
    the other.
  - **e.** Proper fix is upstream: make the column nullable in `stg_film_log.sql` so
    the three-state is carried in the data instead of re-derived per chart, the way
    `liked` already is.

---

## User additions

1. `[x]` **Swap the genre colors for Comedy and Thriller, across all viz.** DONE in
   `palette.ts`: Thriller is now amber `#eda100`, Comedy green `#008300`. The color
   SET is unchanged, only the assignment, so the all-pairs validation in
   `scripts/validate_palette.js` still holds and needs no re-run. Two notes:
   - It moves the known crimson/green deuteranopia collision from Horror/Thriller to
     Horror/Comedy. Still mitigated by labels and hover; identity is never color-alone.
   - `series.ts` `SLOT_COLORS` reuses these five in a fixed order, so slot 2 of every
     *non-genre* dimension (country, language, decade, runtime, MPAA) also changes
     from green to amber. Order is untouched, so nothing repaints on cross-filter.