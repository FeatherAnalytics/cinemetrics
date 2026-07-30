import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { csvParse } from "d3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilmCard } from "@/components/FilmCard";
import { explainRecommendation } from "@/lib/explainClient";
import { DARK, INK } from "@/lib/palette";
import type { CandidateMetadata } from "@/lib/recommend";
import { ThemeProvider, useTheme } from "@/lib/theme";

/**
 * The committed candidate seed, not a fixture.
 *
 * The card's hardest case is the film TMDB has no art for, and how many of those
 * exist and what they look like is a fact about the shipped pool. A hand-built
 * `poster: null` row would pass whether or not the real data still had any.
 *
 * The seed rather than `data/ml/embeddings-v2.json`, which carries the same
 * metadata to the browser but is gitignored: CI has the seed and not the
 * artifact.
 */
const seed = csvParse(readFileSync("../transform/seeds/candidate_enrichment.csv", "utf8"));

/** A seed row as the browser sees it, which is what `train_embeddings.py` ships. */
function asCandidate(row: Record<string, string | undefined>): CandidateMetadata {
  return {
    title: row.title ?? "",
    year: row.release_date ? Number(row.release_date.slice(0, 4)) : null,
    genres: row.genres ?? "",
    keywords: row.keywords ?? "",
    director: row.director ?? "",
    actors: row.actors ?? "",
    runtime: row.runtime ? Number(row.runtime) : null,
    rated: row.rated ?? "",
    language: row.original_language ?? "",
    production_countries: row.production_countries ?? "",
    metascore: row.metascore ? Number(row.metascore) : null,
    rt_rating: row.rt_rating ? Number(row.rt_rating) : null,
    imdb_rating: row.imdb_rating ? Number(row.imdb_rating) : null,
    imdb_id: row.imdb_id ?? "",
    poster: row.poster_path || null,
  };
}

const withPoster = seed.filter((r) => !!r.poster_path);
const withoutPoster = seed.filter((r) => !r.poster_path);

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function Card(props: { metadata: CandidateMetadata; reasons?: { type: string; text: string }[] }) {
  return (
    <ThemeProvider>
      <FilmCard metadata={props.metadata} score={0.42} reasons={props.reasons ?? []} />
    </ThemeProvider>
  );
}

describe("FilmCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it("has both cases to draw: the pool holds films with art and films without", () => {
    expect(seed.length).toBeGreaterThan(7000);
    expect(withPoster.length).toBeGreaterThan(0);
    expect(withoutPoster.length).toBeGreaterThan(0);
  });

  it("draws the poster from TMDB in a box that is reserved before it loads", () => {
    const row = withPoster[0];
    const { container } = render(<Card metadata={asCandidate(row)} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(`https://image.tmdb.org/t/p/w342${row.poster_path}`);
    // Stated dimensions and a lazy load: the drawer scrolls while posters are
    // still arriving, and an unsized image reflows every card below it.
    expect(img!.getAttribute("width")).toBe("58");
    expect(img!.getAttribute("height")).toBe("87");
    expect(img!.getAttribute("loading")).toBe("lazy");
    expect(img!.style.aspectRatio).toBe("2/3");
    // jsdom does no layout, so this stands in for the measurement: without it
    // the flex row stretched the poster to the height of the text beside it and
    // Chrome drew a 58x104 box for a 2:3 image.
    expect(img!.style.alignSelf).toBe("flex-start");
  });

  it("gives the text the full width when TMDB has no art, with no placeholder", () => {
    const row = withoutPoster[0];
    const { container } = render(<Card metadata={asCandidate(row)} />);
    expect(container.querySelector("img")).toBeNull();
    // One child in the row, so nothing holds a column open where the poster
    // would have been.
    const row_ = container.querySelector(".flex.gap-2\\.5");
    expect(row_!.children).toHaveLength(1);
    expect(screen.getByText(row.title!)).toBeTruthy();
  });

  it("opens the meta line with a fact, not with a separator", () => {
    // Films with no release date in the pool overlap heavily with the films that
    // have no poster, so the card that already lost its art was also the one
    // drawing "· 1h 27m".
    const row = seed.find((r) => !r.release_date && !!r.runtime)!;
    render(<Card metadata={asCandidate(row)} />);
    expect(screen.getByText(/h \d+m/).textContent!.trimStart().startsWith("·")).toBe(false);
  });

  it("renders every reason the recommender computed, one per line", () => {
    // A real pair from the pool that shares a director, so the reasons come
    // from explainRecommendation over real metadata rather than from a string
    // written here.
    const byDirector = new Map<string, Record<string, string | undefined>[]>();
    for (const r of seed) {
      if (!r.director) continue;
      const bucket = byDirector.get(r.director) ?? [];
      bucket.push(r);
      byDirector.set(r.director, bucket);
    }
    const pair = [...byDirector.values()].find((rows) => rows.length > 1)!;
    const target = asCandidate(pair[1]);
    const reasons = explainRecommendation(asCandidate(pair[0]), target, {
      [target.genres.split(", ")[0]]: 6,
    });
    expect(reasons.length).toBeGreaterThan(1);

    render(<Card metadata={target} reasons={reasons} />);
    for (const r of reasons) {
      const line = screen.getByText(r.text);
      expect(line.style.fontSize).toBe("12.5px");
      expect(line.style.color).toBe(hexToRgb(INK.secondary));
    }
  });

  it("shows at most three genre pills", () => {
    const row = seed.find((r) => (r.genres ?? "").split(", ").length > 3)!;
    const meta = asCandidate(row);
    render(<Card metadata={meta} />);
    const shown = meta.genres.split(", ").filter((g) => screen.queryByText(g) !== null);
    expect(shown).toHaveLength(3);
  });

  it("recolors with the theme instead of freezing a palette value at import", () => {
    function Toggle() {
      const { toggle } = useTheme();
      return <button onClick={toggle}>toggle</button>;
    }
    const reasons = [{ type: "genre", text: "I rate Horror +6 above avg" }];
    render(
      <ThemeProvider>
        <Toggle />
        <FilmCard metadata={asCandidate(withPoster[0])} score={0.42} reasons={reasons} />
      </ThemeProvider>,
    );
    expect(screen.getByText(reasons[0].text).style.color).toBe(hexToRgb(INK.secondary));
    act(() => screen.getByRole("button").click());
    expect(screen.getByText(reasons[0].text).style.color).toBe(hexToRgb(DARK.ink.secondary));
  });
});
