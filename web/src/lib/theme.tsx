"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ACCENT, DARK, GENRE_COLORS, INK, SURFACE, UI, type GenreKey } from "./palette";

const KEY = "cinemetrics-theme";

export type Theme = "light" | "dark";

export type Tokens = {
  accent: string;
  genre: Record<GenreKey, string>;
  ink: typeof INK;
  surface: typeof SURFACE;
  ui: typeof UI;
};

const LIGHT_TOKENS: Tokens = {
  accent: ACCENT,
  genre: GENRE_COLORS,
  ink: INK,
  surface: SURFACE,
  ui: UI,
};

const DARK_TOKENS: Tokens = {
  accent: DARK.accent,
  genre: DARK.genre,
  ink: DARK.ink,
  surface: DARK.surface,
  ui: DARK.ui,
};

/**
 * A hairline: a token faded toward transparent, for the borders, rules and
 * faint grounds that make up the page chrome.
 *
 * Mixing rather than picking a fixed gray is what lets one value work on both
 * surfaces, and `color-mix` against `transparent` is the spelling every call
 * site used by hand before this existed. The percentages stay as varied as
 * they were: they are the shades the page actually draws, and rounding them
 * toward each other would change what a reader sees.
 *
 * Takes a color rather than reading tokens itself, so a caller passes the one
 * from `useTheme()` and the result follows the theme.
 */
export function hairline(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

const Ctx = createContext<{ theme: Theme; tokens: Tokens; toggle: () => void }>({
  theme: "light",
  tokens: LIGHT_TOKENS,
  toggle: () => {},
});

function preferred(): Theme {
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts light and corrects in an effect rather than reading storage during
  // render: this is a static export, so the prerendered HTML is always the light
  // one, and a render-time read would hydrate against markup that does not match.
  const [theme, setTheme] = useState<Theme>("light");

  // A one-time correction, not the derived-state case the rule guards
  // against: `preferred()` reads localStorage/matchMedia, which do not exist
  // during prerender and must not run until after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTheme(preferred()), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ theme, tokens: theme === "dark" ? DARK_TOKENS : LIGHT_TOKENS, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
