"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, tokens, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition"
      style={{ borderColor: "rgba(127,127,127,0.35)", color: tokens.ink.muted }}
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}
