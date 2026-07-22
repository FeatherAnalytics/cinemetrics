# Cinemetrics Story Ideas

Ideas for storytelling prompts and interactive data narratives.
Each story = a filter preset + highlight set + sentence template.

Status: `build` | `next` | `backlog`

---

## Taste Divergence (Me vs Critics)

Compare my ratings against Metacritic, RT, and IMDB by dimension.

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Genre contrarian | "I rate {genre} {N} points {above/below} critics on average" | `next` |
| Decade contrarian | "I'm most contrarian about films from the {decade}s" | `backlog` |
| Country taste gap | "I rate {country} cinema {N} points {above/below} critics" | `backlog` |
| Language contrarian | "My taste diverges most on {language}-language films" | `backlog` |
| Budget contrarian | "I {love/dismiss} {low/high}-budget films critics {dismiss/love}" | `backlog` |
| MPAA taste | "I rate {rating}-rated films {N} points {above/below} critics" | `backlog` |
| Director disagreement | "The director I disagree with critics most on is {director}" | `backlog` |
| Keyword contrarian | "Films tagged '{keyword}' I rate {N} points above critics" | `backlog` |

### Visualization: Multi-Source Ratings

Current contrarian chart uses only Metacritic. Proposed changes:

1. **Critic source switcher** on existing contrarian chart (Me vs Metacritic / RT / IMDB)
2. **Divergence dot plot** (new chart) for aggregated taste gaps by genre/country/decade
   - Horizontal axis = my avg - critic avg
   - Each row = one genre/country/etc
   - 3 dots per row (one per critic source)

### Taste Residual Analysis (three-act narrative)

Regression: `my_rating ~ metascore + rt_rating + imdb_rating` (R² = 0.214 — critics
explain only 21% of my ratings). Residual = where my taste *truly* deviates after
controlling for what critics think of each specific film.

**Act 1 — Simple divergence** (Option 1): raw `my_rating - critic_avg` per film.
Shows *where* I disagree. Individual film outliers. Entry point for the story.

**Act 2 — Visual clustering** (Option 3): PCA or t-SNE on 4 rating axes projected
to 2D. Films where I deviate visually separate from the main cluster. Shows the
*shape* of disagreement.

**Act 3 — Residual reveal** (Option 4): the punchline. After controlling for critic
scores, which dimensions still show systematic deviation? This catches things genre-level
analysis misses.

**Key findings from prototype (2026-07-21):**

By genre (residual, controlling for critic scores):
- Overrated by me: Crime (+2.8), Adventure (+2.2), Comedy (+2.0)
- Underrated by me: Biography (-4.1), Action (-1.0), Horror (-1.0)
- Note: Horror appears neutral in residuals despite raw divergence showing contrarian

By keyword (strongest signals):
- Overrated: "high school" (+9.4), "playful" (+6.6), "cult" (+5.4), "body horror" (+4.8)
- Underrated: "musical" (-10.3), "family" (-5.9), "christmas" (-5.5)

By country:
- Overrated: Hungary (+9.4), New Zealand (+5.8), France (+2.3)
- Underrated: Hong Kong (-4.0), Germany (-3.6), Ireland (-3.4)

By decade: 1990s (+3.8) and 2020s (+1.5) overrated; 1960s (-8.7) and 1970s (-5.0) underrated.

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Keyword residual | "Controlling for critics, I rate '{keyword}' films {N} points {above/below} expected" | `next` |
| Genre residual | "Critics predict my {genre} ratings, but I still rate them {N} points {above/below}" | `next` |
| Decade residual | "I'm a 90s kid — I rate 90s films 4 points above what critics predict" | `backlog` |
| Country residual | "I overrate {country} cinema {N} points after controlling for critic scores" | `backlog` |
| Biggest individual outlier | "{title}: I rated it {N} points above/below what critics predicted" | `backlog` |
| R² callout | "Critics only explain {N}% of my ratings — my taste is {N}% independent" | `next` |

---

## Temporal / Behavioral

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Binge record | "My biggest binge: {N} films in {month year}" | `next` |
| Longest drought | "My longest gap without watching: {N} days in {period}" | `backlog` |
| Seasonal genres | "In {season}, I mostly watch {genre}" | `backlog` |
| Watch velocity | "I watched {N} films in {year}, {up/down} from {prev_year}" | `backlog` |
| New vs catalog | "{N}% of my watches are films released that same year" | `backlog` |
| Day-of-week | "I watch most films on {day}" | `backlog` |

---

## Spooktober

Dedicated October / Horror narrative.

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Spooktober count | "Spooktober {year}: {N} horror films watched" | `next` |
| Spooktober YoY | "My biggest Spooktober was {year} with {N} films" | `next` |
| Horror year-round | "{N}% of my horror watches happen in October" | `backlog` |
| Spooktober rating | "I rate horror {higher/lower} during October (avg {N})" | `backlog` |

---

## Runtime / Screen Time

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Total screen time | "I've spent {N} days watching films since 2019" | `next` |
| Screen time by year | "My heaviest year was {year}: {N} hours of film" | `backlog` |
| Runtime preference | "My rating sweet spot: {N}-{M} minute films" | `backlog` |
| Long film tax | "I rate 2.5hr+ films {N} points {above/below} average" | `backlog` |
| Genre runtime | "I watch {long/short} {genre} films compared to other genres" | `backlog` |

---

## Rewatches & Rating Drift

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Biggest rating climb | "{title}: rated {N} higher on rewatch" | `next` |
| Biggest rating drop | "{title}: rated {N} lower on rewatch" | `next` |
| Rewatch loyalty | "I rewatch {genre} most ({N} rewatches)" | `backlog` |
| Time to rewatch | "Average {N} days before rewatching a film" | `backlog` |
| Rewatch by rating | "I rewatch films I rated {range} most often" | `backlog` |

---

## Discovery & Obscurity

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Most obscure | "My most obscure watch: {title} ({N} IMDB votes)" | `next` |
| Hidden gem | "Best film nobody's seen: {title} (I rated {N}, only {M} IMDB votes)" | `next` |
| Mainstream index | "{N}% of my watches have over 100K IMDB votes" | `backlog` |
| Overrated blockbuster | "Most overrated: {title} (critics say {N}, I say {M})" | `backlog` |
| Box office vs taste | "Correlation between box office and my rating: {r}" | `backlog` |

---

## People

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Most-watched director | "Most-watched director: {director} ({N} films, avg {rating})" | `next` |
| Highest-rated director | "Highest-rated director (3+ films): {director} (avg {N})" | `backlog` |
| Director consistency | "Most consistent director: {director} (std dev {N})" | `backlog` |
| Director vs critics | "Director I disagree with critics most: {director}" | `backlog` |

---

## Collections / Franchises

| Story | Prompt Template | Status |
|-------|----------------|--------|
| Franchise fatigue | "My ratings trend {up/down} across {collection} sequels" | `backlog` |
| Best franchise entry | "{title} is my favorite {collection} entry; critics prefer {other}" | `backlog` |

---

## Implementation Notes

### Architecture
- Each story = config object: `{ id, category, filters, highlightFn, template, chartFocus }`
- Story selector at top of page (dropdown or carousel)
- Selecting a story applies filters, highlights relevant data, scrolls to relevant chart
- No new data pipeline work — all computable from existing cinemetrics.json

### Priority Order (suggested)
1. Critic source switcher on contrarian chart (quick win, unlocks RT + IMDB data)
2. Total screen time + binge record (dramatic numbers, simple computation)
3. Rating drift on rewatches (data already in rewatch chart)
4. Genre contrarian divergence (new chart, high storytelling value)
5. Spooktober narrative (seasonal hook, builds on genre filter)
6. Hidden gems / obscurity (fun discovery, uses imdb_votes)

### Phase 2: Residual Analysis Charts

Two new charts, replacing/augmenting the contrarian section:

1. **Residual scatter (replaces contrarian diamond)**
   - X = predicted rating (OLS regression on Metacritic + RT + IMDB)
   - Y = my actual rating
   - Genre-colored dots, brush-to-select, click-to-highlight
   - Hover/click shows tooltip with all 4 ratings + predicted + residual
   - Diagonal line = perfect prediction; above = I overrate, below = underrate
   - Regression runs client-side (579 films, 4 vars — trivial)
   - R² callout: "Critics explain only 21% of my ratings"

2. **Keyword residual bars (new chart section)**
   - Horizontal bar chart: avg residual per keyword (min 10 films)
   - Top 8 overrated + top 8 underrated keywords
   - Bar color = dominant genre for that keyword
   - Click a bar → sets selection to films with that keyword → data panel shows them
   - Chart title: "Where my taste really deviates"

Both integrate with existing filter/brush/selection system. No new dependencies.

### Phase 3: Replace Spiral with Swim Lanes ✅ DONE

Completed 2026-07-21. Swim lane chart (`SwimLaneChart.tsx`) replaced the spiral.
Equal-width rows per year, rating as vertical offset, all interactions preserved.
- Unrolled spiral (diagonal layout wastes space)

### Tech Stack
No changes needed. Next.js 16 + React 19 + D3 + Tailwind handles everything.
