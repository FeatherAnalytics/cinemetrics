import type { EnrichedWatch, Film } from "./types";

export function computeScreenTime(watches: EnrichedWatch[]): number {
  let total = 0;
  for (const w of watches) total += w.film?.runtime ?? 0;
  return total;
}

export type AvgRatingResult = {
  mean: number | null;
  ci: number | null;
  n: number;
};

export function computeAvgRating(watches: EnrichedWatch[]): AvgRatingResult {
  const rated = watches.filter((w) => w.rating != null).map((w) => w.rating!);
  const n = rated.length;
  if (n === 0) return { mean: null, ci: null, n: 0 };
  const mean = rated.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ci: null, n };
  const variance = rated.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const ci = Math.round(1.96 * Math.sqrt(variance / n));
  return { mean, ci, n };
}

export function computeMedianRating(watches: EnrichedWatch[]): number | null {
  const rated = watches
    .filter((w) => w.rating != null)
    .map((w) => w.rating as number)
    .sort((a, b) => a - b);
  if (rated.length === 0) return null;
  const mid = Math.floor(rated.length / 2);
  return rated.length % 2 ? rated[mid] : (rated[mid - 1] + rated[mid]) / 2;
}

export function formatScreenTime(minutes: number): { value: string; unit: string } {
  const days = minutes / 60 / 24;
  if (days >= 1) return { value: Math.round(days).toString(), unit: days === 1 ? "day" : "days" };
  const hours = Math.round(minutes / 60);
  return { value: hours.toString(), unit: hours === 1 ? "hour" : "hours" };
}

export type FilmResidual = {
  tmdb_id: number;
  me: number;
  predicted: number;
  residual: number;
  metascore: number;
  rt_rating: number;
  imdb_rating: number;
};

export type RegressionResult = {
  films: FilmResidual[];
  r2: number;
  coefficients: { intercept: number; metascore: number; rt: number; imdb: number };
};

const EMPTY_REGRESSION: RegressionResult = {
  films: [],
  r2: 0,
  coefficients: { intercept: 0, metascore: 0, rt: 0, imdb: 0 },
};

function solveOLS(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const n = X.length;
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < p; j++)
      for (let k = 0; k < p; k++)
        XtX[j][k] += X[i][j] * X[i][k];
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < p; j++)
      Xty[j] += X[i][j] * y[i];
  const aug: number[][] = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let maxRow = col;
    for (let row = col + 1; row < p; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return Array(p).fill(0);
    for (let row = col + 1; row < p; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= p; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  const beta = Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    beta[i] = aug[i][p];
    for (let j = i + 1; j < p; j++) beta[i] -= aug[i][j] * beta[j];
    beta[i] /= aug[i][i];
  }
  return beta;
}

export function computeResiduals(
  watches: EnrichedWatch[],
  byId: Map<number, Film>,
): RegressionResult {
  const agg = new Map<number, { sum: number; n: number }>();
  for (const w of watches) {
    if (w.rating == null) continue;
    const a = agg.get(w.tmdb_id) ?? { sum: 0, n: 0 };
    a.sum += w.rating;
    a.n += 1;
    agg.set(w.tmdb_id, a);
  }

  const rows: { tmdb_id: number; me: number; meta: number; rt: number; imdb: number }[] = [];
  for (const [id, a] of agg) {
    const film = byId.get(id);
    if (!film || film.metascore == null || film.rt_rating == null || film.imdb_rating == null)
      continue;
    rows.push({
      tmdb_id: id,
      me: a.sum / a.n,
      meta: film.metascore,
      rt: film.rt_rating,
      imdb: film.imdb_rating,
    });
  }

  if (rows.length < 5) return EMPTY_REGRESSION;

  const X = rows.map((r) => [1, r.meta, r.rt, r.imdb]);
  const y = rows.map((r) => r.me);
  const beta = solveOLS(X, y);

  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;

  const films: FilmResidual[] = rows.map((r, i) => {
    const predicted = beta[0] + beta[1] * r.meta + beta[2] * r.rt + beta[3] * r.imdb;
    const residual = r.me - predicted;
    ssTot += (y[i] - yMean) ** 2;
    ssRes += residual ** 2;
    return {
      tmdb_id: r.tmdb_id,
      me: r.me,
      predicted,
      residual,
      metascore: r.meta,
      rt_rating: r.rt,
      imdb_rating: r.imdb,
    };
  });

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    films,
    r2,
    coefficients: { intercept: beta[0], metascore: beta[1], rt: beta[2], imdb: beta[3] },
  };
}
