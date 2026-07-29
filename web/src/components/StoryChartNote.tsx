"use client";

import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { ChartId } from "@/lib/stories";

// Inline story note for one secondary chart, styled to match StoryAnnotation
// (which carries the primary chart's note). Sits between the blurb and the
// chart at every breakpoint, so the chart keeps its full width.
export function StoryChartNote({ target }: { target: ChartId }) {
  const { storyResult, storyFocus } = useExplorer();
  const { tokens } = useTheme();
  const note = storyResult?.notes?.[target];
  if (!note || storyFocus?.primary === target) return null;
  return (
    <p
      className="mb-2 rounded-r-lg py-2 pl-3 pr-4 text-xs"
      style={{
        borderLeft: `3px solid ${tokens.accent}`,
        color: tokens.ink.secondary,
        background: `color-mix(in srgb, ${tokens.accent} 8%, ${tokens.surface.paper})`,
      }}
    >
      {note}
    </p>
  );
}
