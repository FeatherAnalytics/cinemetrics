import type { ReactNode } from "react";

// A single computed finding, in the mono/uppercase eyebrow voice, right-aligned
// under a chart. Used sparingly (3–4 on the page) so each one keeps its weight.
// Render nothing when the stat isn't meaningful for the current filter.
export function ChartTakeaway({ children }: { children: ReactNode }) {
  if (children == null || children === false) return null;
  return (
    <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b8981]">
      {children}
    </p>
  );
}
