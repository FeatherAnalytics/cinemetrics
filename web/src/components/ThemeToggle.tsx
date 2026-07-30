"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, tokens, nextTokens, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition"
      style={{ borderColor: "rgba(127,127,127,0.35)", color: tokens.ink.muted }}
    >
      {dark ? "Light" : "Dark"}
      {/* The destination's page ground, as a small filled circle: the label names
          where the toggle goes and this shows it. AFTER the label, so the pill
          reads as a claim then its evidence rather than the other way round.
          A swatch and not the whole pill, because a dark-filled pill in light mode
          would be the highest-contrast thing on the page, and UI state on this
          branch was deliberately moved off the accent so chrome stops competing
          with the data. Decorative - the label and aria-label already say
          everything a reader needs. */}
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full"
        style={{
          background: nextTokens.surface.paper,
          // The two grounds are near-black and near-white, so on the wrong side of
          // the flip the swatch would otherwise vanish into the pill it sits in.
          boxShadow: `inset 0 0 0 0.5px ${tokens.ink.muted}`,
        }}
      />
    </button>
  );
}
