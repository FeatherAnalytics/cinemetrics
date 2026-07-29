import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { barcodeLabel } from "../../components/PosterBarcode";
import { primaryGenre } from "../palette";
import type { Film, Watch } from "../types";

const watches = dataset.watches as Watch[];
const films = new Map((dataset.films as Film[]).map((f) => [f.tmdb_id, f]));

/**
 * A real row from public/data/cinemetrics.json, by the pair that identifies a
 * viewing. Real rows rather than invented ones: the readout is a label a reader
 * sees under the barcode, and a fixture is free to hold a rating the pipeline
 * would never emit.
 */
function row(date: string, tmdb_id: number): Watch {
  const w = watches.find((x) => x.date === date && x.tmdb_id === tmdb_id);
  if (!w) throw new Error(`no watch ${tmdb_id} on ${date} in the shipped dataset`);
  return w;
}

const label = (w: Watch) =>
  barcodeLabel({ date: w.date, genre: primaryGenre(films.get(w.tmdb_id)), rating: w.rating });

describe("barcodeLabel", () => {
  it("shows the rating in stars, never the 0-100 value", () => {
    // Avengers: Age of Ultron. Action/Adventure/Sci-Fi, so Adventure is primary.
    const w = row("2019-01-14", 99861);
    expect(w.rating).toBe(70);
    expect(label(w)).toBe("2019-01-14 · Adventure · 3.5★");
    expect(label(w)).not.toContain("70");
  });

  it("drops a trailing zero so it matches the axis labels", () => {
    // Captain America: Civil War. Action/Sci-Fi carries no tracked genre, and
    // "Other" is a real answer here rather than a gap.
    const w = row("2019-01-21", 271110);
    expect(w.rating).toBe(80);
    expect(label(w)).toBe("2019-01-21 · Other · 4★");
  });

  it("handles the extremes", () => {
    expect(label(row("2019-01-23", 28))).toBe("2019-01-23 · Drama · 5★");
    expect(label(row("2019-08-25", 13092))).toBe("2019-08-25 · Drama · 1★");
  });

  it("omits the rating entirely when the watch has none", () => {
    // No unrated row exists in the shipped data, but Watch.rating is
    // `number | null` and the barcode draws every filtered watch, so an
    // unrated import must not print "null★".
    expect(barcodeLabel({ date: "2020-11-03", genre: "Comedy", rating: null })).toBe(
      "2020-11-03 · Comedy",
    );
  });

  it("agrees with the pipeline's own star_rating for every watch", () => {
    // The external check. Every other assertion here divides by 20 exactly as
    // the implementation does, so they would all agree with a wrong divisor.
    // `stars` comes from the dbt build, so it can disagree.
    for (const w of watches) {
      if (w.rating == null) continue;
      expect(label(w).endsWith(` · ${w.stars}★`)).toBe(true);
    }
  });
});
