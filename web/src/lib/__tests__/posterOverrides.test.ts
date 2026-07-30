import { readFileSync } from "node:fs";
import { csvParse } from "d3";
import { describe, expect, it } from "vitest";

/**
 * The curated poster art has to reach the browser, not merely the mart.
 *
 * It used to be a map in web/src/lib/fourFavs.ts behind a helper each renderer
 * had to call, and the barcode hover did not. Now it is a seed the pipeline
 * coalesces into dim_film.poster_path, so the thing to check is the other end of
 * that pipeline: the shipped JSON. dbt's poster_override_wins test guards the
 * mart; nothing between the mart and this file would fail if the export dropped
 * the column or the JSON were committed a build behind.
 *
 * The committed seed and the committed JSON, not fixtures. Both are what CI has
 * and what the deploy publishes.
 */
const overrides = csvParse(readFileSync("../transform/seeds/poster_overrides.csv", "utf8"));
const slices = csvParse(readFileSync("../transform/seeds/poster_slices.csv", "utf8"));

type ShippedFilm = { tmdb_id: number; poster: string | null; slice: string | null };
const films: ShippedFilm[] = JSON.parse(
  readFileSync("public/data/cinemetrics.json", "utf8"),
).films;

describe("curated poster overrides", () => {
  it("has a row for each film whose TMDB default is not the art wanted", () => {
    // Two today. Pinned so deleting the seed's contents fails here rather than
    // passing an empty loop below -- which is how this curation was lost once.
    expect(overrides.map((r) => r.tmdb_id)).toEqual(["361292", "393519"]);
  });

  it("is what the shipped JSON serves as the film's poster", () => {
    for (const row of overrides) {
      const film = films.find((f) => f.tmdb_id === Number(row.tmdb_id));
      expect(film, `tmdb_id ${row.tmdb_id} missing from cinemetrics.json`).toBeDefined();
      expect(film!.poster).toBe(row.poster_path);
    }
  });

  it("ships the slice sampled from that art, not from the default", () => {
    // The barcode's stripes come from poster_slice, which is precomputed from
    // whatever poster_path held when it was sampled. A changed override with a
    // stale slice draws the old art's colours, and no renderer can tell.
    // scripts/reslice_overridden_posters.py is what keeps them in step.
    for (const row of overrides) {
      const seeded = slices.find((s) => s.tmdb_id === row.tmdb_id);
      const film = films.find((f) => f.tmdb_id === Number(row.tmdb_id));
      expect(seeded?.slice).toBeTruthy();
      expect(film!.slice).toBe(seeded!.slice);
    }
  });
});
