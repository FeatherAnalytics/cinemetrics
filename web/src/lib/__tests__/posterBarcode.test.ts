import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { barcodeLabel, firstWatchYear, tipLeft } from "../../components/PosterBarcode";
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

describe("firstWatchYear", () => {
  const dated = (dates: string[]) => dates.map((s) => ({ d: new Date(s + "T00:00:00Z") }));

  it("reports the log's own start year, from the shipped payload", () => {
    // The external check. Taken off the raw date strings rather than off any
    // Date the helper builds, so a helper reading the wrong end of the log, or
    // reading it in local time, disagrees here.
    const earliest = watches.map((w) => w.date).sort()[0];
    expect(firstWatchYear(watches.map((w) => ({ d: new Date(w.date + "T00:00:00Z") })))).toBe(
      Number(earliest.slice(0, 4)),
    );
  });

  it("takes the earliest watch whatever order the array is in", () => {
    // The caption reads `filtered`, which the store does not promise to sort.
    expect(firstWatchYear(dated(["2023-04-02", "2019-01-14", "2026-07-25"]))).toBe(2019);
  });

  it("keeps a January 1st watch in its own year", () => {
    // Parsed at UTC midnight, so a local-time reading would report 2020 here
    // anywhere west of Greenwich.
    expect(firstWatchYear(dated(["2021-01-01"]))).toBe(2021);
  });

  it("has no year for an empty filter rather than a wrong one", () => {
    expect(firstWatchYear([])).toBeNull();
  });
});

// The tooltip's own width and edge gap, repeated here rather than imported: a
// test that reads the constant it is checking cannot notice the constant moving.
const TIP_W = 252;
const TIP_PAD = 4;

describe("tipLeft", () => {
  // The widths the barcode is actually drawn at, measured in the browser on the
  // built site: 878 in a 1440px window, 308 in a 390px one.
  const DESKTOP = 878;
  const PHONE = 308;

  it("centers the tooltip on the pointer away from the edges", () => {
    expect(tipLeft(DESKTOP / 2, DESKTOP)).toBe(DESKTOP / 2 - TIP_W / 2);
  });

  it("clamps at the left end instead of hanging off the page", () => {
    // The first stripe. Centered, this box would start 126px left of the figure.
    expect(tipLeft(0, DESKTOP)).toBe(TIP_PAD);
    expect(tipLeft(60, DESKTOP)).toBe(TIP_PAD);
  });

  it("clamps at the right end instead of hanging off the page", () => {
    // The last stripe, and the one place a full-width chart differs from the
    // swim lane, whose points are inset far enough never to reach an edge.
    expect(tipLeft(DESKTOP, DESKTOP)).toBe(DESKTOP - TIP_W - TIP_PAD);
    expect(tipLeft(DESKTOP - 60, DESKTOP)).toBe(DESKTOP - TIP_W - TIP_PAD);
  });

  it("pins flush left when the figure is narrower than the tooltip", () => {
    expect(tipLeft(100, 200)).toBe(TIP_PAD);
  });

  it("keeps the tooltip on screen over every watch the site actually ships", () => {
    // The external check: every real stripe the site ships, not a fixture, at the
    // widths the barcode is drawn at on a desktop and on a phone. A clamp that is
    // right for a handful of chosen x values but wrong at some stripe in between
    // fails here. A count rather than a literal, since a daily job appends to this
    // log; 795 stripes when this was written, and the sweep only gets denser.
    expect(watches.length).toBeGreaterThan(700);
    for (const figW of [DESKTOP, 1160, PHONE]) {
      const bw = figW / watches.length;
      for (let i = 0; i < watches.length; i += 1) {
        const left = tipLeft((i + 0.5) * bw, figW);
        expect(left).toBeGreaterThanOrEqual(TIP_PAD);
        expect(left + TIP_W).toBeLessThanOrEqual(figW - TIP_PAD);
      }
    }
  });
});
