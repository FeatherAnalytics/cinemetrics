import type { CandidateMetadata, SparseVec } from "./recommend";

export type Reason = {
  type: string;
  text: string;
};

export type ExplainContext = {
  taste: number[];
  featureNames: string[];
  watches: { tmdb_id: number; rating: number }[];
  vectors: Record<number, SparseVec>;
  metadata: Record<number, CandidateMetadata>;
};

function parseFeature(name: string): { family: string; value: string } {
  const colon = name.indexOf(":");
  if (colon < 0) return { family: "other", value: name };
  return { family: name.slice(0, colon), value: name.slice(colon + 1) };
}

function topRatedWithDim(
  dim: number,
  ctx: ExplainContext,
  limit: number,
): { title: string; rating: number }[] {
  const hits: { title: string; rating: number }[] = [];
  const ratingByFilm = new Map<number, number>();
  for (const w of ctx.watches) {
    const cur = ratingByFilm.get(w.tmdb_id);
    if (cur == null || w.rating > cur) ratingByFilm.set(w.tmdb_id, w.rating);
  }
  for (const [tid, rating] of ratingByFilm) {
    const vec = ctx.vectors[tid];
    if (!vec) continue;
    const idx = vec.idx.indexOf(dim);
    if (idx >= 0 && vec.val[idx] > 0) {
      const meta = ctx.metadata[tid];
      if (meta) hits.push({ title: meta.title, rating });
    }
  }
  hits.sort((a, b) => b.rating - a.rating);
  return hits.slice(0, limit);
}

function phraseReason(
  dim: number,
  featureName: string,
  filmMeta: CandidateMetadata,
  ctx: ExplainContext,
): Reason | null {
  const { family, value } = parseFeature(featureName);

  if (family === "genre") {
    const ratingByFilm = new Map<number, number>();
    for (const w of ctx.watches) {
      const cur = ratingByFilm.get(w.tmdb_id);
      if (cur == null || w.rating > cur) ratingByFilm.set(w.tmdb_id, w.rating);
    }
    const genreCount = [...ratingByFilm].filter(([tid, r]) => {
      if (r < 80) return false;
      const vec = ctx.vectors[tid];
      if (!vec) return false;
      return vec.idx.indexOf(dim) >= 0;
    }).length;
    return { type: "genre", text: `${value}, like ${genreCount} films you rated 80+` };
  }

  if (family === "kw") {
    const matches = topRatedWithDim(dim, ctx, 2);
    if (matches.length >= 2) {
      return {
        type: "keyword",
        text: `shares '${value}' with ${matches[0].title} (${matches[0].rating}) and ${matches[1].title} (${matches[1].rating})`,
      };
    }
    if (matches.length === 1) {
      return {
        type: "keyword",
        text: `shares '${value}' with ${matches[0].title} (${matches[0].rating})`,
      };
    }
    return { type: "keyword", text: `keyword: ${value}` };
  }

  if (family === "director") {
    return { type: "director", text: `directed by ${value}` };
  }

  if (family === "actor") {
    return { type: "actor", text: `stars ${value}` };
  }

  if (family === "country") {
    return { type: "country", text: `from ${value}` };
  }

  return null;
}

const KNOWN_FAMILIES = new Set(["kw", "genre", "director", "actor", "country"]);

export function contrastiveExplain(
  filmVec: SparseVec,
  filmMeta: CandidateMetadata,
  ctx: ExplainContext,
): Reason[] {
  const dimFreq = new Map<number, number>();
  const ratingByFilm = new Map<number, number>();
  for (const w of ctx.watches) {
    const cur = ratingByFilm.get(w.tmdb_id);
    if (cur == null || w.rating > cur) ratingByFilm.set(w.tmdb_id, w.rating);
  }
  const ratedCount = ratingByFilm.size || 1;
  for (const [tid] of ratingByFilm) {
    const vec = ctx.vectors[tid];
    if (!vec) continue;
    for (const i of vec.idx) dimFreq.set(i, (dimFreq.get(i) ?? 0) + 1);
  }

  const contributions: { dim: number; value: number; family: string }[] = [];
  for (let k = 0; k < filmVec.idx.length; k++) {
    const i = filmVec.idx[k];
    const contrib = ctx.taste[i] * filmVec.val[k];
    if (contrib <= 0) continue;
    const name = ctx.featureNames[i] ?? `dim:${i}`;
    const { family } = parseFeature(name);
    if (!KNOWN_FAMILIES.has(family)) continue;
    const df = dimFreq.get(i) ?? 1;
    const idf = Math.log(ratedCount / Math.max(df, 1));
    contributions.push({ dim: i, value: contrib * Math.max(idf, 0.1), family });
  }
  contributions.sort((a, b) => b.value - a.value);

  const reasons: Reason[] = [];
  const usedFamilies = new Set<string>();
  for (const { dim, family } of contributions) {
    if (reasons.length >= 3) break;
    if (usedFamilies.has(family)) continue;
    const name = ctx.featureNames[dim] ?? `dim:${dim}`;
    const reason = phraseReason(dim, name, filmMeta, ctx);
    if (reason) {
      reasons.push(reason);
      usedFamilies.add(family);
    }
  }

  return reasons;
}
