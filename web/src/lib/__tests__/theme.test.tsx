import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../theme";

function Probe() {
  const { theme, tokens, nextTokens, toggle } = useTheme();
  return (
    <button onClick={toggle}>
      {theme}:{tokens.ink.primary}:{nextTokens.surface.paper}
    </button>
  );
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it("follows the OS when nothing is stored", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole("button").textContent).toContain("light");
  });

  it("remembers an explicit override", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toContain("dark");
    expect(localStorage.getItem("cinemetrics-theme")).toBe("dark");
  });

  it("hands charts the token set for the active theme", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole("button").textContent).toContain("#0b0b0b");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toContain("#f2f0ea");
  });

  it("hands a control the token set it would switch to, and swaps it on the flip", () => {
    // What lets the theme toggle preview its destination. The pair has to swap in
    // the same render as `tokens`, or a control showing the far side would go on
    // showing the side it is already on.
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole("button").textContent).toContain("#171613");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toContain("#f7f6f3");
  });

  it("stamps the root element so CSS can follow", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => screen.getByRole("button").click());
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
