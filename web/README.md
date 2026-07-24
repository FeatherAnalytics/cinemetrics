# cinemetrics web

The Next.js dashboard for [cinemetrics](../README.md): a statically exported, cross-filtered
explorer over my Letterboxd history.

## How it works

- **Static export** (`output: "export"`), deployed to GitHub Pages under `/cinemetrics`.
  The dataset (`public/data/cinemetrics.json`) is imported at build time in a Server
  Component, so the full dashboard is prerendered with no client fetch.
- **State** lives in one React context (`src/lib/store.tsx`). Filters and the active story
  are mirrored into the query string (`src/lib/urlState.ts`), so every view is a shareable
  URL; chart titles expose copy-link buttons with `#chart-…` anchors.
- **Charts** are hand-rolled SVG components in `src/components/`, all driven by the same
  filtered watch list.
- **Stories** (`src/lib/stories.ts`) compute a finding from the data, set filters or a
  selection, and annotate the relevant charts.
- **Recommendations** load sparse embeddings from Cloudflare R2 on demand and rank
  candidates by cosine similarity to a rating-weighted taste vector (`src/lib/recommend.ts`).

## Commands

```bash
npm run dev    # dev server at localhost:3000
npm run build  # static export to out/
npm test       # vitest
npx eslint src
```

Run `make build` from the repository root to regenerate the dataset first.
