import { describe, expect, it } from "vitest";
import { ACCENT, DARK, GENRE_COLORS, SURFACE, UI } from "../palette";

describe("palette invariants", () => {
  it("keeps UI state distinguishable from every genre colour", () => {
    // The whole point of the split: no UI-state fill may equal a genre fill,
    // or "this control is on" and "this film is Horror" look identical.
    const genres = Object.values(GENRE_COLORS);
    expect(genres).not.toContain(UI.active);
    expect(genres).not.toContain(UI.activeText);
  });

  it("still spends the accent on Horror, and only on data", () => {
    expect(ACCENT).toBe(GENRE_COLORS.Horror);
  });

  it("orders the surface scale from recessed to raised", () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(lum(SURFACE.well)).toBeLessThan(lum(SURFACE.paper));
    expect(lum(SURFACE.paper)).toBeLessThan(lum(SURFACE.card));
  });
});

describe("dark theme", () => {
  it("lifts the accent so it holds contrast on a dark ground", () => {
    // #c01023 against #131210 is under 3:1. The dark accent has to be lighter.
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(lum(DARK.accent)).toBeGreaterThan(lum(ACCENT));
  });

  it("defines a dark counterpart for every genre", () => {
    expect(Object.keys(DARK.genre).sort()).toEqual(Object.keys(GENRE_COLORS).sort());
  });

  it("inverts the surface scale so the card is the lightest tone", () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(lum(DARK.surface.well)).toBeLessThan(lum(DARK.surface.card));
  });
});
