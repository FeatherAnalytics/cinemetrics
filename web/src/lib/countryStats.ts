import type { EnrichedWatch, Film } from "./types";
import { GENRE_ORDER, primaryGenre, type GenreKey } from "./palette";
import { computeResiduals } from "./stats";

// Minimum films with residuals before a country's mean residual is shown.
export const RESIDUAL_MIN_N = 5;

export type CountryRow = {
  iso: string;
  count: number; // distinct films from this country
  genre: GenreKey; // dominant primary genre among those films
  residual: number | null; // mean rating residual vs prediction (null below RESIDUAL_MIN_N)
  residualN: number; // films behind the residual mean
  filmIds: Set<number>;
};

export type CountryAgg = {
  rows: CountryRow[]; // top countries, ranked by count desc
  totalCountries: number;
  tailCountries: number; // countries beyond rows
  tailFilms: number; // distinct films only produced by tail countries
};

const EMPTY_AGG: CountryAgg = { rows: [], totalCountries: 0, tailCountries: 0, tailFilms: 0 };

// Films list co-productions under every country, so a film may count in several
// rows (same convention the world map used); the tail film count is deduped
// against the top rows so the summary line never double-reports.
export function aggregateCountries(
  watches: EnrichedWatch[],
  byId: Map<number, Film>,
  topN = 15,
): CountryAgg {
  const filmsByIso = new Map<string, Set<number>>();
  const genreTally = new Map<string, Map<GenreKey, number>>();

  for (const w of watches) {
    const f = w.film;
    if (!f) continue;
    const g = primaryGenre(f);
    for (const iso of f.production_countries ?? []) {
      let ids = filmsByIso.get(iso);
      if (!ids) filmsByIso.set(iso, (ids = new Set()));
      if (ids.has(f.tmdb_id)) continue;
      ids.add(f.tmdb_id);
      let t = genreTally.get(iso);
      if (!t) genreTally.set(iso, (t = new Map()));
      t.set(g, (t.get(g) ?? 0) + 1);
    }
  }

  if (filmsByIso.size === 0) return EMPTY_AGG;

  const residualByFilm = new Map(
    computeResiduals(watches, byId).films.map((f) => [f.tmdb_id, f.residual]),
  );

  const all: CountryRow[] = [];
  for (const [iso, ids] of filmsByIso) {
    const t = genreTally.get(iso)!;
    // Ties break by GENRE_ORDER priority, matching the archived map's rule.
    let genre: GenreKey = "Other";
    let best = -1;
    for (const g of [...GENRE_ORDER, "Other"] as GenreKey[]) {
      const n = t.get(g) ?? 0;
      if (n > best) [best, genre] = [n, g];
    }
    let sum = 0;
    let residualN = 0;
    for (const id of ids) {
      const r = residualByFilm.get(id);
      if (r == null) continue;
      sum += r;
      residualN += 1;
    }
    all.push({
      iso,
      count: ids.size,
      genre,
      residual: residualN >= RESIDUAL_MIN_N ? sum / residualN : null,
      residualN,
      filmIds: ids,
    });
  }

  all.sort((a, b) => b.count - a.count || a.iso.localeCompare(b.iso));

  const rows = all.slice(0, topN);
  const tail = all.slice(topN);
  const topFilms = new Set<number>();
  for (const r of rows) for (const id of r.filmIds) topFilms.add(id);
  const tailFilmIds = new Set<number>();
  for (const r of tail) for (const id of r.filmIds) if (!topFilms.has(id)) tailFilmIds.add(id);

  return {
    rows,
    totalCountries: all.length,
    tailCountries: tail.length,
    tailFilms: tailFilmIds.size,
  };
}
