# Frontend Redesign Plan

Agreed changes from the July 2026 frontend review (Chrome DevTools walkthrough of the
live page, desktop + mobile). Scope is the dashboard frontend only — no pipeline or
infrastructure changes. Items are grouped into phases by dependency and impact;
within a phase, order is flexible.

## Status (2026-07-22)

All four phases implemented on branch `feat/frontend-redesign` (pushed). Highlights
and where reality diverged from the plan below:

- **Phase 1 ✓** — world map archived; `CountryBars` replaces it (tooltip later removed
  entirely per user — everything it showed is already on the chart).
- **Phase 2 ✓** — swim-lane guides, keyword caption, rolling reference band, rewatch
  bands. Scatter **replaced** rather than de-noised: jitter was rejected, so after a
  three-way prototype the scatter became `ResidualDotStack` (true unit histogram) and a
  new `StreakStripes` section was added (median baseline + month ticks).
- **Phase 3 ✓** — `ChartTakeaway` (3 findings), finding-oriented titles, story chips
  with short labels (Spooktober / Hidden gems / Laugh to live), narrative lede,
  Spooktober `monthFocus`. Rating Drift story cut.
- **Phase 4 ✓** — recommend drawer + cards restyled to the site palette; loading /
  unavailable / no-matches states; footer colophon with pipeline + GitHub + data date.

- **OG image ✓** — social-share card added. A static `web/public/opengraph-image.png`
  (1200×630, site palette) wired via `openGraph`/`twitter` metadata + `metadataBase`.
  Static PNG (not the generated route) so GitHub Pages serves it as `image/png` under
  the `/cinemetrics` base path. Regenerate from the ImageResponse snippet in git history
  if the branding changes.

Not yet done / possible follow-ups: film-age "archive reach" stripes (deferred);
dumbbell "biggest arguments" as a story chip (idea); verify all stories'
selections are visible without scrolling on smaller viewports.

## Decisions log

Settled during review — do not relitigate without new evidence:

| Topic | Decision |
|---|---|
| World map | Remove from page; archive the code for possible future use (3D globe idea). Replace with a ranked country chart. |
| Swim lane rating encoding | **Commit** to it (not remove). Start small: faint guide lines at ratings 25 and 75 inside each year band. |
| Scatter y-axis | Do **not** trim the min. There is a rating at 20, future data may go lower, and trimming reads as dishonest. |
| Rating scale ÷10 | Rejected. Dividing all ratings by 10 relabels the axis but leaves every dot in the same relative position — the banding is caused by ratings quantized to tens, not by the scale. |
| Keyword bar `n=` labels | Remove inline `(n=#)`; add a caption noting the ≥10-film threshold. Count stays in the tooltip. |
| Keyword bar genre colors | **Keep.** Genre coloring is the consistent encoding across all charts; two-color-by-sign would break that. |
| Rolling average window | Keep 10 as default. Test 20–25 side by side before deciding anything. |
| Rolling average grey line | Replace the misaligned overall line with a flat overall-average reference band. |
| Section titles | Retitle around the *finding*, not the mechanism (currently three titles start with "Where", two are near-duplicates). |
| Stat/takeaway lines | Add more computed lines in the style of "CRITICS EXPLAIN 21% OF MY RATINGS" — sparingly. One per chart maximum, 3–4 total on the page. |
| Footer | Add "how this works" + GitHub link. No bio ("who I am" lives on the main site). |
| Recommend drawer | Restyle in site palette; add loading state; distinguish load-failure from no-matches. |

## Phase 1 — Prune and replace the map

### 1a. Archive WorldMap

- Move `web/src/components/WorldMap.tsx` → `web/src/components/_archive/WorldMap.tsx`
  with a top-of-file comment: why archived, date, and the future 3D-globe idea.
  (Git history also preserves it, but the archive folder keeps it discoverable.)
- Remove the import and `<section>` for the map from `web/src/app/page.tsx`.
- Keep `web/public/data/countries.geojson` — harmless, and needed if the globe returns.
- Update `web/src/lib/stories.ts`: `ChartId` includes `"map"` and stories dim it
  (`dim: ["map"]`). Remove `"map"` from the union and from every story's focus arrays.
- Check `web/src/lib/__tests__/stories.test.ts` for references to `"map"`.

### 1b. New country chart (replaces the map's job)

A ranked horizontal bar/dot list of top ~12–15 production countries. This must keep
everything the map actually did for the page:

- **Data**: reuse the map's aggregation pattern — aggregate over every filter *except*
  country (self-excluding cross-filter), dedupe films per country by `tmdb_id`,
  dominant genre per country. Lift this logic out of the archived component into
  `web/src/lib/` so it's testable and shared.
- **Per row**: country name, film count (bar length), dominant-genre color
  (consistency with other charts), and mean residual vs prediction (e.g. "+4.0")
  where n is large enough — this is the *finding* the map hid (Japan +4 on anime).
- **Interaction**: row click → `setCountry(iso)` exactly like map click did; selected
  row gets the crimson accent; clicking again (or reset) clears. Dropdown in
  FilterBar must stay in sync (it already reads the same store).
- **Long tail**: after the top N, one summary row ("+ 45 more countries · 61 films")
  rather than an endless list. Optionally expandable later.
- New component: `web/src/components/CountryBars.tsx`, modeled on `KeywordBars.tsx`
  (same label/bar/value layout, same hover tooltip pattern).
- Section title: finding-oriented (see Phase 3 retitling), e.g. "What travels well".

**Acceptance**: country filter still reachable from the chart; stats bar updates on
click; mobile renders as readable rows (no tiny tap targets); no geojson fetch on page load.

## Phase 2 — Chart fixes

### 2a. Swim lanes: commit to the rating encoding

`web/src/components/SwimLaneChart.tsx`:

- Add faint horizontal guide lines inside each year band at rating 25 and 75
  (INK.grid at low opacity, thinner than the month gridlines — they must recede).
- Caption gains a short cue tying position to the lines, e.g. "dots above the upper
  line = rated 75+".
- If the lines alone don't make the encoding legible, revisit row height next —
  small change first, evaluate visually before going further.

### 2b. Scatter: de-noise without touching the domain

`web/src/components/ResidualScatter.tsx`:

- ~~Vertical jitter~~ REJECTED 2026-07-22: tried ±3 deterministic jitter, user ruled
  it out — moving data points cuts against the chart's honesty, same principle as
  the axis-trimming rejection. Dots stay at exact values.
- Lower dot opacity (~0.55) so density reads through overplot. DONE.
- Keep y-domain 0–100. No axis trimming.
- Axis vocabulary: title/subtitle say "critics", x-axis says "predicted rating".
  Unify, and add one sentence about the model behind "predicted" (what features it
  uses, that the residual is me-minus-model). This is a place to show the modeling
  work — one sentence in the section subtitle, not a paragraph.
- If jitter still isn't enough, the fallback design is a residual view (y = me −
  predicted, x = predicted): the deviation *is* the y-axis, which is this chart's
  stated goal. Prototype only if needed after jitter+opacity are judged.

### 2c. Keyword bars: label cleanup

`web/src/components/KeywordBars.tsx`:

- Remove ` (n=#)` from the bar labels (the `<tspan>` at ~line 148).
- Add caption under the section subtitle: "keywords appearing in 10+ rated films"
  (wording to match `MIN_FILMS`; keep it derived from the constant, not hardcoded).
- Tooltip already shows the count — unchanged.
- Genre colors stay.

### 2d. Rolling averages: fix the comparison, test the window

`web/src/components/RollingRating.tsx` (+ `web/src/lib/series.ts` where the series
are built):

- Replace the per-panel grey rolling *line* with a flat reference: the overall
  average rating for the current filter set, drawn as a horizontal line or thin band.
  The current grey line plots "nth watch overall" against "nth watch in group" —
  different points in time at the same x, so the comparison is invalid.
- Legend text "overall (all films)" and the panel aria-labels change accordingly.
- Window: default stays 10. Add a temporary dev-only toggle (or just branch-test) to
  view 20 and 25; decide by eye whether the smoother line better serves the section's
  "settling" premise. Record the outcome here.

### 2e. Rewatches: restructure around the deltas

`web/src/components/RewatchCadence.tsx`:

- Group rows into three bands: **Grew** (last rating > first), **Soured**, **Unchanged**.
- Sort Grew/Soured by |delta| descending; label the extremes inline
  ("Suspiria 60 → 85").
- Collapse Unchanged behind a toggle ("50 unchanged — show"). Default collapsed.
- The existing footer counts ("21 grew · 11 soured · 50 unchanged") become the band
  headers instead of a footnote.
- Expected outcome: ~2/3 shorter chart, every visible row carries a story.

## Phase 3 — Storytelling

### 3a. Takeaway lines (the "critics explain 21%" pattern)

- Extract the existing annotation (in `ResidualScatter.tsx`, mono uppercase style)
  into a shared `ChartTakeaway` component: computed value, mono/uppercase styling,
  consistent placement (below chart, right-aligned).
- Add sparingly — target 3–4 total on the page:
  - Scatter: keep "CRITICS EXPLAIN {r2}% OF MY RATINGS".
  - Country chart: e.g. "{n} COUNTRIES · JAPAN RUNS +4 ABOVE PREDICTION" (computed,
    not hardcoded — pick the largest-|residual| country above a minimum n).
  - Swim lanes: e.g. "OCTOBER IS {pct}% HORROR" (computed from month × genre).
  - Rewatches: the grew/soured counts already fill this role once promoted to
    band headers — do not double up with another line.
- Each line must be computed from the filtered data and degrade gracefully (hide, or
  fall back to a neutral phrasing, when the filter makes the stat meaningless or n
  is too small).

### 3b. Stories that prove their claims

`web/src/lib/stories.ts`:

- **Spooktober**: the headline claims October; the view must show October. Add month
  focus to `StoryResult` (e.g. `monthFocus: 9`) and have `SwimLaneChart` highlight
  October columns / dim other months when set. Filter should focus horror **in
  October** (the existing genre filter stays, but the visual emphasis carries the claim).
- Audit the other three stories the same way: after activation, the headline should
  be visually self-evident within ~2 seconds on the primary chart. Adjust
  `focus`/`filters`/`selection` until true. (Rating Drift and Hidden Gems already
  select the relevant watches; verify the selection is *visible* on the primary
  chart without scrolling.)

### 3c. Story chips replace the dropdown

`web/src/components/FilterBar.tsx` (STORY block) + `page.tsx`:

- Replace the `<select>` with visible chips/cards showing each story's **computed
  headline** ("I rate musicals 10 pts below the critics"), not its mechanism label
  ("Genre Contrarian"). Compute headlines once at load from the full dataset.
- Active chip gets the accent treatment; clicking the active chip (or an ✕) returns
  to free explore.
- Placement to design: chips likely move out of the sidebar to sit under the page
  header, since they are now invitations, not controls. Sidebar keeps a compact
  "story active" indicator + clear button.

### 3d. Narrative lede

`web/src/app/page.tsx` header:

- Replace/augment the mechanics-first intro ("cross-filtered — change any control…")
  with 2–3 sentences of actual findings, each phrase linking to (activating) the
  corresponding story state. The mechanics sentence can survive as a smaller second
  line.
- Copy is personal voice, concrete numbers, no dashboard-speak.

### 3e. Retitle sections around findings

Current → direction (final copy at implementation time; the test: the title states
or teases a finding, and no two titles share an opener):

| Current | Problem | Direction |
|---|---|---|
| When I watch | fine | keep or near-keep |
| Where I align and deviate | "Where" #1, near-duplicate of next | e.g. "What critics get right about me" |
| Where my taste deviates | "Where" #2 | e.g. "The keywords that betray me" |
| Where they come from (map → country chart) | "Where" #3 | e.g. "What travels well" |
| How my taste settles | promises more than chart shows | retitle once 2d lands |
| Rewatches | flat label | e.g. "What survives a second watch" |

## Phase 4 — Recommend drawer + page chrome

### 4a. Drawer restyle

`web/src/components/RecommendDrawer.tsx`, `web/src/components/FilmCard.tsx`:

- Replace the foreign palette (slate `#1e293b`, purple `#7b2cbf`/`#c084fc`, Tailwind
  green/amber pills) with the site system: paper surface, INK text scale, crimson
  accent, mono uppercase eyebrow for "RECOMMENDED FOR YOU". Genre pills use
  `GENRE_COLORS`.
- Also fix the "Recommend" trigger button in the sidebar (currently purple) to match.
- Bump the 9px pill text to a legible size while in there.

### 4b. Drawer loading + error states

- Three distinct states instead of one message:
  - **Loading**: shown while `loadEmbeddings` is in flight ("Loading
    recommendations…" or a small skeleton). Currently the empty state shows during
    load, which reads as broken.
  - **Unavailable**: fetch failed or `NEXT_PUBLIC_R2_URL` unset — "Recommendations
    are unavailable right now", not "no matches".
  - **No matches**: filters genuinely excluded everything — keep current message,
    add a "clear drawer filters" affordance.
- Speed: `loadEmbeddings` result should be cached across drawer opens (check
  `web/src/lib/recommend.ts` — add module-level memoization if absent). Optionally
  prefetch on first hover/focus of the Recommend button.

### 4c. Footer / colophon

`web/src/app/page.tsx`:

- Short footer: one sentence on the pipeline (Letterboxd RSS → dbt/DuckDB → static
  Next.js, auto-updated daily), GitHub repo link, data-freshness date (already in
  the exported JSON — surface it). No bio.

## Cross-cutting checks (every phase)

- `make test` green (ruff + eslint + dbt + vitest); update affected tests, notably
  `stories.test.ts` (ChartId change) and any store/series tests touched by 2d.
- Mobile (390px): new country chart rows tappable; story chips wrap; drawer states
  legible.
- Keep aria-labels current when charts change meaning (several reference the map or
  the grey rolling line today).
- Static export still works (`make build`) — no new runtime fetches other than
  existing JSON/R2.

## Open items to test, not yet decided

- Rolling window 20–25 vs 10 (2d) — TESTED 2026-07-22 at 25: much smoother arcs
  (Horror's dip-and-recovery and Drama's rise read clearly), but short series
  suffer — "other genre" (25 watches) vanishes entirely (below the min-points
  threshold) and Adventure shrinks to a stub. Staying at 10 per decision; if
  revisited, consider a smaller window only for series under ~50 watches.
- Scatter overplotting: RESOLVED 2026-07-22. After prototyping three alternatives
  the scatter was replaced by ResidualDotStack (diverging unit histogram — every
  film one dot, grid-packed in 5-point bins, no extreme labels per user). A new
  StreakStripes section (one stripe per rated watch, diverging around my average)
  was added before "How my taste settles". The dumbbell "biggest arguments"
  prototype was cut as a chart but its content (named top disagreements, e.g.
  All Cheerleaders Die 61→100 vs Alien 83→50) should return as a Phase 3 story
  chip. Old scatter archived in components/_archive.
- DEFERRED: film-age stripes ("archive reach") — one stripe per watch coloured by
  how old the film was when watched, sequential single hue. User wants this
  eventually; not now.
- Swim lane guide lines at 25/75: enough to carry the rating encoding, or does row
  height need to grow (2a).
- Story chip placement: under header vs in sidebar (3c).

## Already done (during review session)

- `web/.env.local` created with `NEXT_PUBLIC_R2_URL` (value is public — it's
  committed in plaintext in `.github/workflows/deploy.yml`) so recommendations work
  in local dev. Gitignored; nothing to deploy.
