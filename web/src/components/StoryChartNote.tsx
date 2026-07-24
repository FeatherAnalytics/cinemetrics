"use client";

import { useExplorer } from "@/lib/store";
import { ACCENT } from "@/lib/palette";
import type { ChartId } from "@/lib/stories";

// Inline story note for one secondary chart, styled to match StoryAnnotation
// (which carries the primary chart's note). Sits between the blurb and the
// chart at every breakpoint, so the chart keeps its full width.
export function StoryChartNote({ target }: { target: ChartId }) {
  const { storyResult, storyFocus } = useExplorer();
  const note = storyResult?.notes?.[target];
  if (!note || storyFocus?.primary === target) return null;
  return (
    <p
      className="mb-2 rounded-r-lg py-2 pl-3 pr-4 text-xs"
      style={{ borderLeft: `3px solid ${ACCENT}`, color: "#3d3c38", background: "#faf5f0" }}
    >
      {note}
    </p>
  );
}
