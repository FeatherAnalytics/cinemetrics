import type { CandidateMetadata } from "./recommend";
import type { Film } from "./types";

export type Reason = {
  type: string;
  text: string;
};

function splitComma(val: string | undefined | null): string[] {
  return (val || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function getKeywords(source: CandidateMetadata | Film): string[] {
  if (Array.isArray((source as Film).keywords)) {
    return (source as Film).keywords;
  }
  return splitComma((source as CandidateMetadata).keywords);
}

function getDirector(source: CandidateMetadata | Film): string {
  return typeof source.director === "string" ? source.director : "";
}

export function explainRecommendation(
  source: CandidateMetadata | Film | undefined,
  target: CandidateMetadata,
  genreAffinities: Record<string, number>,
): Reason[] {
  if (!source) return [];
  const reasons: Reason[] = [];

  const sourceKw = new Set(getKeywords(source));
  const targetKw = new Set(splitComma(target.keywords));
  const sharedKw = [...sourceKw].filter((k) => targetKw.has(k));
  if (sharedKw.length > 0) {
    reasons.push({
      type: "keywords",
      text: `Keywords: ${sharedKw.slice(0, 3).join(", ")}`,
    });
  }

  const sourceDirs = splitComma(getDirector(source));
  const targetDirs = splitComma(target.director);
  const sharedDirs = sourceDirs.filter((d) => targetDirs.includes(d));
  if (sharedDirs.length > 0) {
    reasons.push({
      type: "director",
      text: `Director: ${sharedDirs[0]}`,
    });
  }

  const targetGenres = splitComma(target.genres);
  let bestBoost = 0;
  let bestGenre = "";
  for (const g of targetGenres) {
    const boost = genreAffinities[g] ?? 0;
    if (boost > bestBoost) {
      bestBoost = boost;
      bestGenre = g;
    }
  }
  if (bestGenre && bestBoost > 0) {
    reasons.push({
      type: "genre",
      text: `You rate ${bestGenre} +${Math.round(bestBoost)} above avg`,
    });
  }

  return reasons.slice(0, 3);
}

export function computeGenreAffinities(
  films: Film[],
  watches: { tmdb_id: number; rating: number | null }[],
): Record<string, number> {
  const ratingsByGenre: Record<string, number[]> = {};
  const allRatings: number[] = [];
  const filmMap = new Map(films.map((f) => [f.tmdb_id, f]));

  for (const w of watches) {
    if (w.rating == null) continue;
    allRatings.push(w.rating);
    const film = filmMap.get(w.tmdb_id);
    if (!film) continue;
    for (const g of film.genres) {
      (ratingsByGenre[g] ??= []).push(w.rating);
    }
  }

  const overallAvg = allRatings.length > 0
    ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
    : 0;
  const affinities: Record<string, number> = {};
  for (const [genre, ratings] of Object.entries(ratingsByGenre)) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    affinities[genre] = avg - overallAvg;
  }
  return affinities;
}
