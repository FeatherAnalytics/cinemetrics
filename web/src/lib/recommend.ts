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

export type EmbeddingData = {
  vectors: Record<number, number[]>;
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
      score: cosineSimilarity(sourceVec, vec),
      metadata: meta,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
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

let _cache: { data: EmbeddingData } | null = null;

export async function loadEmbeddings(
  r2Url: string,
): Promise<{ data: EmbeddingData }> {
  if (_cache) return _cache;
  const embRes = await fetch(`${r2Url}/embeddings.json`, { cache: "no-store" });
  if (!embRes.ok) throw new Error("Failed to load embeddings");
  const data: EmbeddingData = await embRes.json();
  _cache = { data };
  return _cache;
}
