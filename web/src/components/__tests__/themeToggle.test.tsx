import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DARK, SURFACE } from "@/lib/palette";
import { ThemeProvider } from "@/lib/theme";

/** jsdom reports resolved colors, so the palette's hex has to be converted. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function mount() {
  const view = render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
  return {
    button: screen.getByRole("button"),
    swatch: view.container.querySelector("span[aria-hidden='true']") as HTMLElement,
  };
}

describe("ThemeToggle", () => {
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

  it("fills the swatch with the ground of the theme it would switch to", () => {
    const { button, swatch } = mount();
    expect(swatch.style.background).toBe(hexToRgb(DARK.surface.paper));
    act(() => button.click());
    expect(swatch.style.background).toBe(hexToRgb(SURFACE.paper));
  });

  it("keeps the label and the pressed state naming the destination", () => {
    const { button } = mount();
    expect(button.textContent).toBe("Dark");
    expect(button.getAttribute("aria-label")).toBe("Switch to dark theme");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    act(() => button.click());
    expect(button.textContent).toBe("Light");
    expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("hides the swatch from assistive tech", () => {
    // The label and aria-label already carry the destination. A swatch announced
    // as well would say it a third time, in a form a screen reader cannot use.
    const { swatch } = mount();
    expect(swatch.getAttribute("aria-hidden")).toBe("true");
  });
});
