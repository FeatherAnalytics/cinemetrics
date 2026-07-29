"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";

// A single computed finding, in the mono/uppercase eyebrow voice, right-aligned
// under a chart. Used sparingly (3–4 on the page) so each one keeps its weight.
// Render nothing when the stat isn't meaningful for the current filter.
export function ChartTakeaway({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  if (children == null || children === false) return null;
  return (
    <p
      className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.1em]"
      style={{ color: tokens.ink.muted }}
    >
      {children}
    </p>
  );
}
