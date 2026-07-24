export type CandidateMetadata = {
  title: string;
  year: number | null;
  genres: string;
  keywords: string;
  director: string;
  actors: string;
  runtime: number | null;
  rated: string;
  language: string;
  production_countries: string;
  metascore: number | null;
  rt_rating: number | null;
  imdb_rating: number | null;
  imdb_id: string;
};

/**
 * Sparse embedding: parallel arrays of dimension indices and their values.
 * Vectors are L2-normalized at export time, so cosine between two of them is
 * just the dot product over shared indices.
 */
export type SparseVec = { idx: number[]; val: number[] };

export type EmbeddingData = {
  dims: number;
  vectors: Record<number, SparseVec>;
  metadata: Record<number, CandidateMetadata>;
};

// Wire format for embeddings-v2.json: each vector is an [indices, values] pair.
type EmbeddingFileV2 = {
  dims: number;
  vectors: Record<number, [number[], number[]]>;
  metadata: Record<number, CandidateMetadata>;
};

export type Recommendation = {
  tmdb_id: number;
  score: number; // cosine similarity (0-1)
  metadata: CandidateMetadata;
};

export type RecommendationFilters = {
  language?: "en" | "non-en";
  runtimeRange?: [number, number];
  genre?: string;
};

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Cosine between two sparse vectors (two-pointer walk over sorted indices). */
export function sparseCosine(a: SparseVec, b: SparseVec): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.val) normA += v * v;
  for (const v of b.val) normB += v * v;
  let i = 0;
  let j = 0;
  while (i < a.idx.length && j < b.idx.length) {
    if (a.idx[i] === b.idx[j]) {
      dot += a.val[i] * b.val[j];
      i++;
      j++;
    } else if (a.idx[i] < b.idx[j]) {
      i++;
    } else {
      j++;
    }
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Cosine between a dense vector (with precomputed norm) and a sparse one. */
function denseSparseCosine(dense: number[], denseNorm: number, s: SparseVec): number {
  let dot = 0;
  let normS = 0;
  for (let i = 0; i < s.idx.length; i++) {
    dot += s.val[i] * dense[s.idx[i]];
    normS += s.val[i] * s.val[i];
  }
  const denom = denseNorm * Math.sqrt(normS);
  return denom === 0 ? 0 : dot / denom;
}

export function topNSimilar(
  sourceTmdbId: number,
  data: EmbeddingData,
  n: number,
  excludeIds: Set<number>,
): Recommendation[] {
  const sourceVec = data.vectors[sourceTmdbId];
  if (!sourceVec) return [];

  const scored: Recommendation[] = [];
  for (const [idStr, vec] of Object.entries(data.vectors)) {
    const id = Number(idStr);
    if (excludeIds.has(id)) continue;
    const meta = data.metadata[id];
    if (!meta) continue;
    scored.push({
      tmdb_id: id,
      score: sparseCosine(sourceVec, vec),
      metadata: meta,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// Ratings above this pull the taste vector toward a film's embedding; ratings
// below push it away. Sits under the rating median (70) so mildly-liked films
// still contribute positive signal.
const NEUTRAL_RATING = 60;

/**
 * Rating-weighted mean of the embeddings of films the user has rated: the
 * direction in embedding space their taste points. Returns null when no rated
 * film has an embedding (callers fall back to unweighted sampling).
 */
export function tasteVector(
  data: Pick<EmbeddingData, "dims" | "vectors">,
  watches: { tmdb_id: number; rating: number | null }[],
): number[] | null {
  // Average rating per film so a much-rewatched favourite counts once.
  const sums = new Map<number, { total: number; n: number }>();
  for (const w of watches) {
    if (w.rating == null || !data.vectors[w.tmdb_id]) continue;
    const cur = sums.get(w.tmdb_id) ?? { total: 0, n: 0 };
    cur.total += w.rating;
    cur.n += 1;
    sums.set(w.tmdb_id, cur);
  }
  if (sums.size === 0) return null;

  const taste = new Array<number>(data.dims).fill(0);
  for (const [id, { total, n }] of sums) {
    const weight = (total / n - NEUTRAL_RATING) / (100 - NEUTRAL_RATING);
    const vec = data.vectors[id];
    for (let i = 0; i < vec.idx.length; i++) taste[vec.idx[i]] += weight * vec.val[i];
  }
  return taste.some((v) => v !== 0) ? taste : null;
}

/** Score every candidate not in excludeIds by cosine similarity to `taste`. */
export function scoreByTaste(
  taste: number[],
  data: EmbeddingData,
  excludeIds: Set<number>,
): Recommendation[] {
  let norm = 0;
  for (const v of taste) norm += v * v;
  const tasteNorm = Math.sqrt(norm);
  const scored: Recommendation[] = [];
  for (const [idStr, vec] of Object.entries(data.vectors)) {
    const id = Number(idStr);
    if (excludeIds.has(id)) continue;
    const meta = data.metadata[id];
    if (!meta) continue;
    scored.push({
      tmdb_id: id,
      score: Math.max(0, denseSparseCosine(taste, tasteNorm, vec)),
      metadata: meta,
    });
  }
  return scored;
}

export function filterRecommendations(
  recs: Recommendation[],
  filters: RecommendationFilters,
): Recommendation[] {
  return recs.filter((r) => {
    if (filters.language === "en" && r.metadata.language !== "en") return false;
    if (filters.language === "non-en" && r.metadata.language === "en") return false;
    if (filters.runtimeRange) {
      const rt = r.metadata.runtime;
      if (rt == null) return false;
      if (rt < filters.runtimeRange[0] || rt > filters.runtimeRange[1]) return false;
    }
    if (filters.genre) {
      const genres = r.metadata.genres.split(", ").map((g) => g.trim());
      if (!genres.includes(filters.genre)) return false;
    }
    return true;
  });
}

/** Decode the wire format's [indices, values] pairs into SparseVec objects. */
export function decodeEmbeddings(file: EmbeddingFileV2): EmbeddingData {
  const vectors: Record<number, SparseVec> = {};
  for (const [id, [idx, val]] of Object.entries(file.vectors)) {
    vectors[Number(id)] = { idx, val };
  }
  return { dims: file.dims, vectors, metadata: file.metadata };
}

let _cache: { data: EmbeddingData } | null = null;

export async function loadEmbeddings(
  r2Url: string,
  version: string,
): Promise<{ data: EmbeddingData }> {
  if (_cache) return _cache;
  // The version param (derived from the dataset) busts the browser's HTTP
  // cache whenever a data update deploys; between deploys the R2 object's
  // Cache-Control lets repeat visits skip the download entirely.
  const embRes = await fetch(
    `${r2Url}/embeddings-v2.json?v=${encodeURIComponent(version)}`,
  );
  if (!embRes.ok) throw new Error("Failed to load embeddings");
  const data = decodeEmbeddings((await embRes.json()) as EmbeddingFileV2);
  _cache = { data };
  return _cache;
}
