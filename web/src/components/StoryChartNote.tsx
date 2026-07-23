"use client";

import { useExplorer } from "@/lib/store";
import { ACCENT } from "@/lib/palette";
import type { ChartId } from "@/lib/stories";

// Mobile-only inline story note for one chart. On desktop the same prose lives in
// the right-hand StoryPanel, so this is hidden there (lg:hidden).
export function StoryChartNote({ target }: { target: ChartId }) {
  const { storyResult } = useExplorer();
  const note = storyResult?.notes?.[target];
  if (!note) return null;
  return (
    <p
      className="mb-2 rounded-r border-l-2 py-1 pl-2 text-xs lg:hidden"
      style={{ borderColor: ACCENT, color: "#3d3c38", background: "rgba(192,16,35,0.04)" }}
    >
      {note}
    </p>
  );
}
