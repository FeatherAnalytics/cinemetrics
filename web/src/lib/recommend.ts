export type CandidateMetadata = {
  title: string;
  year: number | null;
  genres: string;
  keywords?: string;
  director?: string;
  actors?: string;
  runtime: number | null;
  rated: string;
  language: string;
  production_countries: string;
  metascore: number | null;
  rt_rating: number | null;
  imdb_rating: number | null;
  imdb_id: string;
  /** TMDB image path, e.g. "/abc123.jpg". Null where TMDB serves no art. */
  poster: string | null;
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
  featureNames?: string[];
};

// Wire format for embeddings-v2.json: each vector is an [indices, values] pair.
type EmbeddingFileV2 = {
  dims: number;
  vectors: Record<number, [number[], number[]]>;
  metadata: Record<number, CandidateMetadata>;
};

export type Recommendation = {
  tmdb_id: number;
  score: number;
  cosineScore: number;
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
    const cos = sparseCosine(sourceVec, vec);
    scored.push({
      tmdb_id: id,
      score: cos,
      cosineScore: cos,
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
  // Average rating per film so a much-rewatched favorite counts once.
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

/** Mean of available normalized critic scores (metascore/100, rt/100, imdb/10), or pool mean when none. */
export function criticPrior(meta: CandidateMetadata, poolMean: number): number {
  const scores: number[] = [];
  if (meta.metascore != null) scores.push(meta.metascore / 100);
  if (meta.rt_rating != null) scores.push(meta.rt_rating / 100);
  if (meta.imdb_rating != null) scores.push(meta.imdb_rating / 10);
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : poolMean;
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
    const cos = Math.max(0, denseSparseCosine(taste, tasteNorm, vec));
    scored.push({
      tmdb_id: id,
      score: cos,
      cosineScore: cos,
      metadata: meta,
    });
  }
  return scored;
}

/** Score candidates by cosine(taste, film) + λ · prior(film). */
export function scoreWithPrior(
  taste: number[],
  data: EmbeddingData,
  excludeIds: Set<number>,
  lambda: number,
): Recommendation[] {
  const base = scoreByTaste(taste, data, excludeIds);
  if (lambda === 0) return base;
  const poolMean = computePoolMean(base.map((r) => r.metadata));
  for (const r of base) {
    r.score = r.cosineScore + lambda * criticPrior(r.metadata, poolMean);
  }
  return base;
}

function computePoolMean(metas: CandidateMetadata[]): number {
  let sum = 0;
  let n = 0;
  for (const m of metas) {
    const p = criticPrior(m, NaN);
    if (!isNaN(p)) { sum += p; n++; }
  }
  return n > 0 ? sum / n : 0.5;
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

/** Parse the v3 binary format: per film uint32 tmdb_id, uint16 nnz, nnz×uint16 indices, nnz×float16 values. */
export function parseV3Binary(buf: ArrayBuffer): Record<number, SparseVec> {
  const view = new DataView(buf);
  const vectors: Record<number, SparseVec> = {};
  let offset = 0;
  while (offset < buf.byteLength) {
    const tmdbId = view.getUint32(offset, true);
    const nnz = view.getUint16(offset + 4, true);
    offset += 6;
    const idx: number[] = new Array(nnz);
    for (let i = 0; i < nnz; i++) {
      idx[i] = view.getUint16(offset, true);
      offset += 2;
    }
    const f16 = new Uint16Array(buf, offset, nnz);
    const val: number[] = new Array(nnz);
    for (let i = 0; i < nnz; i++) {
      val[i] = float16ToNumber(f16[i]);
    }
    offset += nnz * 2;
    vectors[tmdbId] = { idx, val };
  }
  return vectors;
}

function float16ToNumber(h: number): number {
  const sign = (h >> 15) & 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) {
    return (sign ? -1 : 1) * 2 ** -14 * (frac / 1024);
  }
  if (exp === 0x1f) {
    return frac ? NaN : (sign ? -Infinity : Infinity);
  }
  return (sign ? -1 : 1) * 2 ** (exp - 15) * (1 + frac / 1024);
}

/**
 * Bumped whenever the artifact's CONTENT changes without the dataset changing.
 *
 * The cache key used to be the watch count alone, which meant a rebuild that
 * fixed the payload but added no watches reused the stale copy already in every
 * browser's HTTP cache — exactly what happened when the candidate titles were
 * backfilled: the file on R2 was correct and the page still drew blanks.
 */
const EMBEDDINGS_BUILD = "3-posters";

let _cache: { data: EmbeddingData } | null = null;

export async function loadEmbeddings(
  r2Url: string,
  version: string,
): Promise<{ data: EmbeddingData }> {
  if (_cache) return _cache;
  const v = `${encodeURIComponent(version)}-${EMBEDDINGS_BUILD}`;
  const [binRes, metaRes, featRes] = await Promise.all([
    fetch(`${r2Url}/embeddings-v3.bin?v=${v}`),
    fetch(`${r2Url}/metadata-v3.json?v=${v}`),
    fetch(`${r2Url}/features-v3.json?v=${v}`),
  ]);
  if (!binRes.ok || !metaRes.ok || !featRes.ok) throw new Error("Failed to load embeddings");
  const [buf, meta, feat] = await Promise.all([
    binRes.arrayBuffer(),
    metaRes.json() as Promise<Record<number, CandidateMetadata>>,
    featRes.json() as Promise<{ dims: number; names: string[] }>,
  ]);
  const vectors = parseV3Binary(buf);
  const data: EmbeddingData = {
    dims: feat.dims,
    vectors,
    metadata: meta,
    featureNames: feat.names,
  };
  _cache = { data };
  return _cache;
}
