# CONTINUITY: Watchlist story

## Goal

A "Watchlist" story chip on the main page that swaps in four charts describing
the Letterboxd watchlist: genre, release decade, keywords, and origin
(country/language). Done when the chip renders four working charts against real
enriched data, the rail is reduced to the filters that mean something for
unwatched films, and ruff / eslint / dbt / vitest / next build all pass.

**Status: complete.** All phases done and verified in the browser.

## Constraints

- Watchlist films are NOT `Film`s. No rating, no watch date, no `liked`, no
  rewatch state. Anything walking `films` or `watches` finds nothing for them.
- `stg_watchlist` is a SNAPSHOT, not history. Removals are recorded nowhere, so
  no dwell time, time-to-watch, or conversion rate can ever be derived from it.
- Seeds stay append-only. `candidate_enrichment.csv` was appended to, never
  rewritten. (`watchlist.csv` itself is the documented exception — it is a
  current-state list rebuilt wholesale by `build_watchlist_seed.py`.)
- Never `csv.writer` directly — `ingest.csvio.dict_writer` only, or the CRLF bug
  returns and DuckDB's sniffer fails the dbt build.

## Key Decisions

1. **Story spine: the watchlist on its own**, not compared against watched films.
   User chose this over a watchlist-vs-watched framing and a backlog/age framing.
   Charts describe the list's shape rather than making a claim about taste.
2. **Enrichment appended to `candidate_enrichment.csv`**, not a new seed. Same
   18-column schema, same "not yet rated" semantics, and `fetch_candidates.py`
   already dedupes across both enrichment seeds so nothing double-fetches.
   Accepted side effect: those 83 films join the recommender pool via
   `dim_candidate`, which is arguably correct — recommending a film already
   shortlisted is a hit.
3. **Reduced filter rail** while the story is active: genre, release year,
   runtime, country, language. Rating / watch-year / rewatch are REMOVED, not
   ignored — a visible control that does nothing reads as a bug. Content rating
   and franchise go too, because `dim_watchlist` does not export them.
4. **Genre counts every genre a film carries**, so bars sum past the film count.
   `primaryGenre` was rejected here: it recognises five genres and would file
   Documentary, Crime, Mystery and Science Fiction together under "Other",
   losing most of the list. The takeaway line states the overlap.
5. **`compute` gained an optional third parameter** (`watchlist?`) rather than a
   new signature. Every other story still declares two params and stays
   assignable; tests and pre-`dim_watchlist` payloads still call with two.
6. **`recomputeOnFilter: true`.** The rail stays live in this story, so the
   headline must track it or it claims "130 films waiting" over charts showing 19.
7. **Origin is one chart with a toggle**, not two. Country and language mostly
   agree, so side-by-side they read as one finding stated twice.

## State

- Done:
  - [x] Phase 1: Enrich the 83 uncovered watchlist films (`scripts/enrich_watchlist.py`)
  - [x] Phase 2: `dim_watchlist` mart + tests + `_marts.yml` docs
  - [x] Phase 3: `export_web.py` emits a top-level `watchlist` array
  - [x] Phase 4: `WatchlistFilm` type, store wiring, `filterWatchlist`
  - [x] Phase 5: Third chart mode + story config + reduced rail
  - [x] Phase 6: Four chart components
  - [x] Phase 7: Tests (24 new), browser verification, low-n verification

## Defects found and fixed during the work

- **Decade labels collided.** `"10s"` named both the 1910s and the 2010s, and
  the list spans 1917–2026 so this was live, not hypothetical. Caught by a test
  written for exactly that. Labels are now full years; on a narrow column every
  other label is dropped rather than shrinking the type.
- **`SU` printed as a bare code** among real country names. Seven Soviet films
  are on the list. Added SU/CU/PS/QA to `COUNTRY_NAME` — all four are codes the
  watchlist reaches that the viewing history never does.
- **`cn` printed as a bare code.** TMDB writes Cantonese as `cn`, which is not a
  language code at all (it is a COUNTRY code; ISO 639-3 has `yue`), so
  `Intl.DisplayNames` handed the string back. Consolidated the two copies of
  `languageName` into `lib/languages.ts` with an override map.
- **Stat tiles reported the watch log** (hours watched, rewatch share, avg
  rating) while the charts below showed the watchlist. Swapped to time-to-clear
  / on-the-list / already-seen.
- **Vacuous copy at n=1 decade.** "The 1910s is the heaviest decade" names the
  only bar; "1910s to 1910s" is not a range. Both now branch on `decades.length`.

## Open Questions

- UNCONFIRMED: should the watchlist story's cross-filters be shareable by URL?
  They are not today — `urlState.ts` encodes a story ALONE, on the reasoning that
  a story fully determines its filters. That is now false for the two chart-set
  stories (stats and watchlist), which set no filters and leave the rail live.
  Pre-existing behaviour inherited from the stats story, not a regression.
- UNCONFIRMED: `enrich_watchlist.py` is not wired into `make update`, so a film
  added to the watchlist after today will have no enrichment until it is run by
  hand. `fetch_candidates.py` may pick it up incidentally (the watchlist seeds
  its similar-films queries) but nothing guarantees it.

## Working Set

- Branch: `feat/chart-prototypes` (uncommitted)
- New: `scripts/enrich_watchlist.py`, `transform/models/marts/dim_watchlist.sql`,
  `web/src/lib/watchlistChart.ts`, `web/src/lib/languages.ts`,
  `web/src/components/watchlist/{RankedBars,WatchlistDecades,WatchlistGenres,WatchlistKeywords,WatchlistOrigin}.tsx`,
  `web/src/lib/__tests__/watchlistChart.test.ts`
- Modified: `scripts/export_web.py`, `transform/models/marts/_marts.yml`,
  `web/src/lib/{types,store,stories,palette,countries}.ts(x)`,
  `web/src/components/{ExplorerApp,FilterBar,StatBar}.tsx`
- Seed: `transform/seeds/candidate_enrichment.csv` +83 rows (6318 → 6401)
- Test: `make test` — ruff + eslint + dbt (42 PASS) + vitest (213 PASS)
- Verify: `make dev`, then the "Watchlist" chip
