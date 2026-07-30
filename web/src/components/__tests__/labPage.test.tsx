import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { Lab } from "@/components/lab/Lab";
import { ThemeProvider } from "@/lib/theme";
import { computeTravelStats, ratioLabel, signedLabel } from "@/lib/travelStats";
import { computeEraStats } from "@/lib/gradSchool";
import type { Dataset } from "@/lib/types";

/**
 * The lab page as a PAGE, rather than as the sum of its charts.
 *
 * The panels have their own tests; what those cannot see is the shell around
 * them, which is what made the route read as a different site: no left column, a
 * numbered heading, and a preamble that said what the sections went on to say
 * again. Every assertion here is about the page's shape, and every figure it
 * checks is computed from the shipped payload rather than typed in.
 */
const data = dataset as unknown as Dataset;
const stats = computeTravelStats(data);
const eraStats = computeEraStats(data);

const src = (rel: string) => readFileSync(path.join(__dirname, "../..", rel), "utf8");

function mount() {
  return render(
    <ThemeProvider>
      <Lab data={data} />
    </ThemeProvider>,
  );
}

const collapse = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});

describe("the lab sits in the same shell as the main page", () => {
  it("puts a rail beside the content", () => {
    const { container } = mount();
    const rail = container.querySelector("aside");
    expect(rail, "the lab has a left column").not.toBeNull();
    expect(rail?.className).toContain("rail-column");
    // Beside, not above: the content column is the rail's sibling in a flex row,
    // which is the arrangement that makes both pages start their charts at the
    // same x.
    expect(rail?.parentElement?.className).toContain("lg:flex");
    expect(rail?.nextElementSibling?.className).toContain("flex-1");
  });

  /**
   * The two rails have to be ONE column, and jsdom lays nothing out, so the only
   * checkable version of "same width" is that neither page owns a width of its
   * own. Both name `rail-column`; the width lives in globals.css.
   */
  it("takes the rail's width from the same rule the main page does", () => {
    const explorer = src("components/ExplorerApp.tsx");
    const lab = src("components/lab/LabRail.tsx");
    const css = src("app/globals.css");

    expect(css).toContain("--rail-width");
    expect(css).toMatch(/\.rail-column\s*\{[^}]*width:\s*var\(--rail-width\)/);
    for (const [name, file] of [
      ["ExplorerApp", explorer],
      ["LabRail", lab],
    ] as const) {
      expect(file, `${name} names the shared column`).toContain("rail-column");
      expect(file, `${name} must not carry a width of its own`).not.toMatch(/lg:w-\d/);
    }
  });

  it("numbers no section, the way the main page numbers none", () => {
    const { container } = mount();
    for (const h of container.querySelectorAll("h1, h2")) {
      expect(collapse(h.textContent), "a numbered heading").not.toMatch(/^\d+\.\s/);
    }
  });

  it("holds the sections in arrival order, comparison first and school last", () => {
    const { container } = mount();
    const ids = [...container.querySelectorAll("section[id]")].map((s) => s.id);
    expect(ids).toEqual(["comparison", "callout", "grad-school"]);
  });
});

describe("the rail carries readouts and not controls", () => {
  it("links to every section on the page, in the page's own order", () => {
    const { container } = mount();
    const rail = container.querySelector("aside");
    const hrefs = [...(rail?.querySelectorAll("a[href^='#']") ?? [])].map((a) =>
      (a.getAttribute("href") ?? "").slice(1),
    );
    const ids = [...container.querySelectorAll("section[id]")].map((s) => s.id);
    expect(hrefs).toEqual(ids);
    // And each link names its section, so the rail is a table of contents rather
    // than a row of anchors.
    for (const id of ids) {
      const link = rail?.querySelector(`a[href='#${id}']`);
      const heading = container.querySelector(`section#${id} h2`);
      expect(collapse(link?.textContent), id).toBe(collapse(heading?.textContent));
    }
  });

  /**
   * The decision the rail may not quietly overturn. The travel panels are
   * measured on 21 watches; a control that cut those to 4 would give each panel a
   * different number and turn a comparison of presentations into a comparison of
   * arithmetic.
   */
  it("puts no filter in the rail", () => {
    const { container } = mount();
    const rail = container.querySelector("aside");
    expect(rail?.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  });

  it("reads every rail figure off the payload", () => {
    const { container } = mount();
    const rail = collapse(container.querySelector("aside")?.textContent ?? "");
    expect(rail).toContain(ratioLabel(stats.filmsPerDayRatio));
    expect(rail).toContain(stats.travel.filmsPerDay.toFixed(2));
    expect(rail).toContain(stats.ordinary.filmsPerDay.toFixed(2));
    expect(rail).toContain(`${stats.travel.multiFilmDays} of ${stats.travel.days}`);
    expect(rail).toContain(signedLabel(stats.ratingDiff));
    expect(rail).toContain(`${eraStats.eraMonths} mo`);
    expect(rail).toContain(`${eraStats.span.watches} watches`);
    // The null result is stated as a word, not left as a signed number for the
    // reader to interpret, and the word is looked up.
    expect(stats.ratingGapIsNoise).toBe(true);
    expect(rail).toContain("Unchanged");
  });
});

describe("what the trim was allowed to remove and what it was not", () => {
  it("drops the preamble that said what the sections say", () => {
    const text = collapse(mount().container.textContent);
    expect(text).not.toContain("The travel finding, for sections 1 and 2");
    expect(text).not.toContain("Not a travel finding");
    // The claims it carried are still on the page, in the sections that own them.
    expect(text).toContain(ratioLabel(stats.filmsPerDayRatio));
    expect(text).toMatch(/does not move|Unchanged/);
  });

  it("keeps an Against it note on both travel panels", () => {
    const text = collapse(mount().container.textContent);
    expect(text.match(/Against it:/g) ?? []).toHaveLength(2);
    expect(text).toContain("Why it is here and not on the main page:");
    expect(text).toContain("refusing the causal reading");
  });

  it("keeps the caveats the grad school section exists for", () => {
    const text = collapse(mount().container.textContent);
    expect(text).toContain("It is not evidence that school did it");
    expect(text).toContain("A chart cannot establish an absence");
    expect(text).toContain("rank among overlapping stretches rather than a test");
    expect(text).toContain("5.0 points above everything outside it");
    expect(text).toContain("Two windows, because the two measures need different ones");
    expect(text).toContain("The climb that got it to");
  });

  /**
   * A budget, because the failure this page had was length, and nothing stops
   * length coming back a sentence at a time.
   *
   * 1,229 rendered words before the trim and 1,053 after. The total counts the
   * callout's film list, the neighbor table and every axis label, none of which
   * the trim touched, so the prose came down by more than the 14% this shows.
   * The cap leaves room for a paragraph a future section genuinely needs and
   * none for a slide back to where the page started.
   */
  it("holds the page to its word budget", () => {
    const words = collapse(mount().container.textContent).trim().split(" ").length;
    expect(words).toBeLessThan(1100);
  });
});
