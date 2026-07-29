# Prior Art & Platform Notes

What's worth borrowing from other Letterboxd projects, what isn't, and what we've
learned about the platform itself. Data-quality findings live in
[CHART-IDEAS.md](CHART-IDEAS.md#data-quality-notes) (D1–D4); this file is about
external code and Letterboxd mechanics.

Last surveyed: 2026-07-25

| Repo | Status | Verdict |
|---|---|---|
| [jjoej15/letterboxd-recs](https://github.com/jjoej15/letterboxd-recs) | examined | Ideas only: no licence, incompatible architecture |
| [0x0m0t0/serverless-letterboxd-api](https://github.com/0x0m0t0/serverless-letterboxd-api) | examined | Two concrete borrows |
| `letterboxd_recommendations` | ⏳ cloning (~5 GB) | Unexamined: see [open questions](#letterboxd_recommendations-unexamined) |

---

## jjoej15/letterboxd-recs

React + FastAPI app doing **SVD collaborative filtering** over ~13M ratings scraped
from 5,009 popular Letterboxd members. Fundamentally different signal from ours: it
knows *who else liked a film*; our content-based engine only knows *what a film is like*.

⚠️ **No LICENSE file: all rights reserved by default. Reference only; reimplement,
don't copy.**

### Worth taking

- **Watchlist scraping** (`data-processing/get_recs.py:48-105`), ~50 lines of
  BeautifulSoup. Superseded for us: the account export gives the watchlist directly
  and without scraping.
- **Popularity / obscurity ranking** (`data-processing/film_scraper.py`): scrapes
  Letterboxd's popularity-ordered film list for a per-film rank, plus viewer counts.
  We have **no obscurity axis** and TMDB `popularity` is a weak, volatile proxy. Their
  three-tier "less known / lesser known / unknown" filter is a good UX precedent. Scrape
  only our candidate pool, never their 950k.
- **Async batching** (`film_scraper.py:73-98`), 50 concurrent requests via
  `asyncio`/`aiohttp`. Our `fetch_candidates.py` walks every rated film's `/similar`
  endpoint synchronously; that's the slowest step in the pipeline.
- **Unrated-film imputation** (`get_recs.py:132-149`): impute a logged-but-unrated film
  as the user's mean; Letterboxd's internal "rating-16" class means liked-but-unrated.
  We currently drop those films from scoring.

### Deliberately not taking

- **The SVD model as built.** Surprise is effectively unmaintained, the artifact is
  213 MB of pickles, and it needs a live Python server: incompatible with our static
  export. If we ever want the collaborative signal, the right shape is: train item-item
  factors *offline*, export vectors only for films in our candidate pool, concatenate
  onto the existing content vectors, and keep scoring client-side exactly as
  `web/src/lib/recommend.ts` does now. Same deployment model, hybrid signal.
- **Blend mode** (`use_model.py:102-157`): recommendations for two users averaged.
  Clever, but this is a single-person dashboard.

### Anti-patterns to avoid

- `while resp_code != 200 and attempts < 100` (`ratings_scraper.py:50-53`): a
  100-attempt retry hammer.
- `time.sleep` inside async code (`film_scraper.py:36`): blocks the whole event loop.

### Incompatibilities

Their ratings are 1–10; ours are 0–100. They key on Letterboxd URL slugs; we key on
`tmdb_id`. Any data borrowed needs a slug→tmdb join they never store: which is exactly
[the resolver problem](#the-tmdb-resolution-problem).

---

## 0x0m0t0/serverless-letterboxd-api

~90 lines: Hono on Cloudflare Workers parses the Letterboxd RSS with `fast-xml-parser`
and serves it as JSON behind a bearer token, edge-cached 5 minutes. Parses the *same
feed* as `ingest/letterboxd.py` but extracts two fields we discard.

### Worth taking

- **`liked`, `letterboxd:memberLike`** (`src/index.ts:59`). We ignore it entirely. A
  3.5★ you hearted means something different from one you didn't: and W4 has now
  **proven** that empirically (r² = 0.409; likes are not a rating threshold). Note the
  RSS only carries ~50 recent items, so historical likes come from the export, not here.
- **Poster URL**: regex off the RSS `description` HTML (`src/index.ts:26`). We have no
  poster art anywhere. But TMDB's `poster_path` is the better source: higher resolution,
  already cached by `fetch_candidates.py`, and available for *candidate* films the RSS
  can never describe. Take the idea, not the implementation.

### Architectural idea (with a caveat)

The site is a static export rebuilt daily, so it's only ever as fresh as the last
Action run. A worker like this would let the deployed page fetch "watched today"
client-side, live. **But** the bearer auth can't survive in a public static bundle: it would need a public read-only endpoint with CORS locked to our origin.

### Already handled

Single-item feeds parsing as an object (their `isArray` fix), `ElementTree.findall` is
immune. List entries with `watchedOn: null`, `ingest/letterboxd.py:56-57` already skips
entries without a watched date.

---

## samlearner/letterboxd_recommendations

The mature one: MongoDB + Redis + FastAPI + React under Docker, SVD collaborative
filtering over a 50M+ rating corpus (sampling up to ~5M per request). 9.2 GB of git
history. Live at letterboxd.samlearner.com.

⚠️ **GPL-3.0.** Copying any of it would oblige cinemetrics to become GPL-3.0.
**Reference only: reimplement from the idea, never paste.**

### The film-page → TMDB id mapping (our tier-4 fallback, confirmed)

Letterboxd film pages carry outbound TMDB and IMDb anchors, tagged for analytics:

```python
LBX_TMDB_ANCHOR = ("a", {"data-track-action": "TMDB"})
LBX_IMDB_ANCHOR = ("a", {"data-track-action": "IMDb"})
_TMDB_MOVIE_RE  = re.compile(r"/movie/(\d+)/?")
_TMDB_TV_RE     = re.compile(r"/tv/(\d+)/?")
```

One request per film, exact, no fuzzy matching. This is the deterministic fallback for
anything title search can't reach: and a production project relies on it, so the
selector is stable enough to trust.

### Three things worth knowing

- **`content_type`: films vs TV.** They classify each entry as movie or tv. Letterboxd
  carries TV entries and our pipeline is films-only; a resolver that blindly takes
  `/movie/(\d+)` mishandles them silently. **Confirmed in our own data:** 4 of the 6
  rows our resolver flagged for review are TV series (*Cowboy Bebop*, *Scavengers
  Reign*, *The Expanse: One Ship*). Open decision: exclude TV, or extend the schema.
- **They use `curl_cffi`** (`cffi_async_session`) to impersonate a browser's TLS
  fingerprint for *anonymous* page scraping. Notable contrast with our finding that
  plain `requests` + full headers suffices for the *authenticated* export endpoint. If
  we ever implement tier 4, budget for needing TLS impersonation.
- **`consolidate_redirects.py` exists** because Letterboxd slugs redirect when films are
  renamed or merged: the same phenomenon as our `Glass Onion` rename. At their scale it
  needed dedicated handling.

### The author's own caveat on collaborative filtering

From their README: the model *"is completely blind to genres, themes, directors, cast…
it tends to recommend very popular movies often, regardless of an individual user's
taste"*. Worth weighing before adding CF here: it's a candid admission from someone
running it in production, and it argues that CF complements rather than replaces our
content-based approach.

### Not evaluated

The ratings corpus itself. It's scraped from other users' public profiles, and both
licence and provenance would need review before any use. Don't vendor multi-GB
artifacts into this repo regardless.

---

## Letterboxd platform mechanics

Learned directly, not from any repo. Verified 2026-07-25.

### Account data export

**Synchronous**: one authenticated GET returns the zip. No job queue, no polling,
no email link.

```
GET /user/exportdata   -> 302 -> /user/exportdata/
GET /user/exportdata/  -> 200  text/html (trigger page, 367 bytes)
GET /data/export/      -> 200  application/zip
                          content-disposition: attachment; filename=letterboxd-<user>-<ts>.zip
```

Only the last request matters. Implemented in `ingest/letterboxd_export.py`.

### Authentication

- **Sign-in is gated by Cloudflare Turnstile**, so scripted login is not viable. Sign in
  once in a browser and reuse the cookie (`scripts/set_export_cookie.py` lifts it from a
  HAR so it never passes through a shell history or a chat transcript).
- Six cookies: `letterboxd.user`, `letterboxd.user.CURRENT`, `letterboxd.signed.in.as`,
  `com.xk72.webparts.csrf`, `cf_clearance`, `useMobileSite`.
- **`cf_clearance` is bound to the originating IP *and* User-Agent.** A cookie minted at
  home and replayed from a CI datacenter runner is likely to be rejected: the reason the
  scheduled fetch belongs on a home-network host rather than GitHub Actions.
- ⚠️ **Unverified:** how long the session survives. Tested once, minutes after minting.
  Re-run `scripts/fetch_export.py` after an hour and after a day before trusting any
  schedule. If it's short-lived, cookie replay is the wrong architecture and the fallback
  is a persistent browser profile that regenerates clearance itself.

### Cloudflare scores headers, not TLS fingerprints

A minimal `requests` call with a valid cookie gets **403**. The *same* call with Firefox's
full header set succeeds. Plain `requests` is sufficient, **no `curl_cffi`, no headless
browser.** The required set is in `ingest/letterboxd_export.py:BROWSER_HEADERS`;
`Accept-Encoding` deliberately omits `br`/`zstd` since `requests` can't decode zstd.

### Export data model

| File | Rows | Notes |
|---|---:|---|
| `diary.csv` | 665 | Full watch history. `Date` = logged, `Watched Date` = watched |
| `watched.csv` | 585 | Unique films |
| `ratings.csv` | 585 | **Film-level** ratings: the authoritative source |
| `likes/films.csv` | 239 | The ♥ signal |
| `watchlist.csv` | 136 | Live watchlist |
| `lists/*.csv` | 11 lists | Nested header; `Position` gives rank |
| `reviews`, `comments`, `profile` |, | 🔒 Personal content: never commit |

**The join that matters:** `ratings.csv`, `likes/films.csv` and `watched.csv` all key on
the same *film* URI, so they join to each other exactly and need no tmdb resolution.
Only `diary.csv` uses a per-entry URI (Belzebuth: `boxd.it/1bcBgh` in the diary vs
`boxd.it/cWZk` everywhere else). This is what made W4 answerable immediately.

**List files have a nested header:**

```
0 | Letterboxd list export v7
1 | Date,Name,Tags,URL,Description     <- list metadata header
2 | 2024-10-02,spooktober 2024,,...    <- list metadata
3 |                                     <- blank
4 | Position,Name,Year,URL,Description <- film header
5 | 1,Suspiria,1977,https://boxd.it/1SNW,
```

Naive `DictReader` yields list values for these; parse past the blank line.

### The tmdb resolution problem

**No export file carries a `tmdb_id` or `imdb_id`**: only `boxd.it` short URIs, `Name`,
and `Year`. We key everything on `tmdb_id`, so watchlist and list films need resolving.

- Films already watched resolve locally against `film_log` (585 of them).
- The watchlist (136) and unwatched list films need TMDB search by title+year.
- `Suspiria (1977)` vs `Suspiria (2018)` in the same list proves **year is mandatory**;
  title alone is ambiguous.
- Titles get **renamed over time**: `Glass Onion` → `Glass Onion: A Knives Out Mystery`,
  `Mission: Impossible - Dead Reckoning Part One` → `…Dead Reckoning`. Four films in our
  diary already show this.
- Letterboxd and TMDB **years disagree**, D1 found 48 films off by exactly one. Any
  resolver must allow ±1 year tolerance or it will produce false negatives.
- Deterministic fallback: resolve the `boxd.it` URI → film page → read the TMDB link off
  it. That's scraping, one request per film, but it's exact.

**Success criteria:** precision massively outranks recall. A wrong id silently attaches
the wrong genre/runtime/poster and is undetectable downstream; an unresolved film is
visibly missing and fixable by hand. Route everything uncertain to a review file rather
than guessing.

### Measured: 100% / 100% on a 676-film holdout (2026-07-25)

`film_log`'s known ids are a free labeled set: and independent of TMDB title search,
since they come from Letterboxd's own RSS `tmdb:movieId` (or, for sheet-era rows, from
`imdb_id` via TMDB `/find`). Three strategies were measured:

| | precision | recall |
|---|---:|---:|
| v1: strict title+year | 99.26% | 99.70% |
| v2, + vote tie-break | 99.26% | 100% |
| **v3, ±1 window, vote-ranked** | **100%** | **100%** |

**The key finding: an exact year match is false confidence.** Every v1 failure was a
film from the D1 year-repair set: precisely those where Letterboxd's year disagrees
with TMDB's. Querying TMDB with Letterboxd's year skips the correct film and lands on a
*different* film sharing that title and year. "The Witch" is 2015 on Letterboxd and
2016 on TMDB, and there is exactly one genuinely-2015 film called "The Witch": the
wrong one. Uniqueness gave no protection.

**The validated algorithm:**

1. Pool results from both the year-filtered and unfiltered `/search/movie` calls.
2. Keep candidates whose normalized `title` **or** `original_title` matches exactly.
3. Narrow to release years within **±1** of the target.
4. Rank by `vote_count`, then `popularity`; use year proximity **only** to break ties.
   Never short-circuit on an exact-year hit.
5. Flag as ambiguous when a runner-up holds ≥50% of the winner's votes.

Why `vote_count` and not `popularity`: popularity is a volatile current-trend score,
vote_count is a stable proxy for "the film someone actually meant".

⚠️ **Known limits: the holdout is not fully representative.**

- Every holdout film is one that was *watched*, so they skew popular and findable. The
  watchlist may hold obscure films where vote-ranking is exactly wrong: an obscure
  intended film could lose to a famous same-title rival. This is the failure mode to
  watch, and the ambiguity flag is the guard.
- Input titles came from `film_log`, not the export. Export titles differ where
  Letterboxd renamed a film (`Glass Onion` → `Glass Onion: A Knives Out Mystery`), which
  the holdout doesn't exercise.
- Ambiguity flagging fired on 7 of 676 (~1%), all false alarms here. On unlabeled data
  that's a cheap review queue, not a defect.

### Production run (2026-07-25)

`ingest/resolve_tmdb.py` + `scripts/resolve_export.py`, run over the real export:

```
533 unique (title, year) pairs across watchlist + lists
  resolved confidently : 527  (98.9%)
  needs review         :   6  (1.1%)

  window_unique  351     local          147
  window_ranked   30     unresolved       4
  title_anyyear    1
```

### With the film-page fallback (`ingest/letterboxd_film_page.py`)

Adding the deterministic fallback closed the review queue entirely:

```
533 unique (title, year) pairs
  resolved confidently : 530  (99.4%)
  excluded as TV       :   3  (0.6%)
  needs review         :   0

  window_unique  351     tv_excluded   3
  local          147     film_page     3
  window_ranked   29
```

Every remaining ambiguity was settled by reading the boxd.it page's outbound TMDB
anchor. The three TV entries got their real TMDB **tv** ids (Cowboy Bebop `30991`,
Scavengers Reign `204154`, The Expanse: One Ship `155655`) and were excluded on
`content_type`, not inferred from a failed film search.

**It also overturned a manual spot-check.** Reviewing the earlier queue by eye, this
document claimed *War and Peace (1965)* had resolved to "the correct 1965 Bondarchuk
epic (`11706`)". The film page says **`29266`**: listed in that same runners-up set as
"War and Peace (1968)". Bondarchuk's film was released in parts across 1965–67, so TMDB
dates the complete work 1968 while Letterboxd says 1965. The eyeballed claim was wrong;
the deterministic source is why.

⚠️ **Cloudflare did not challenge these requests**: plain `requests` plus browser
headers was enough, despite samlearner needing `curl_cffi` for anonymous scraping.
Volume is the likely difference (6 requests vs a bulk crawl). Don't assume this scales;
`FilmPageBlocked` is raised distinctly so a challenge is unmistakable if it ever starts.

**Reused since, and it still works.** The four "Four Favs" short links resolved
cleanly through the same path (`dLd2` → 393519 Raw, `cioI` → 361292 Suspiria,
`23wW` → 4977 Paprika, `94Hg` → 290250 The Nice Guys), all `content_type:
"movie"`, no Cloudflare challenge at four requests. Mapping committed to
`web/src/lib/fourFavs.ts` rather than resolved at build time.

Outputs land in `data/raw/letterboxd_export/` (gitignored) as `resolved.csv`,
`review.csv` and `excluded_tv.csv`. Nothing is written to `transform/seeds/`: seed
generation is deliberately a separate reviewable step, because a wrong tmdb_id is
undetectable once it reaches a mart.

⚠️ **Still unverified:** the 530 confident matches are not individually checked. The
holdout measured 100%, but on *watched*: hence popular: films. The obscure-watchlist
failure mode (an obscure intended film losing to a famous same-title rival) remains
theoretically open. The film page could settle every one of them deterministically if
it is ever worth ~400 polite requests.
