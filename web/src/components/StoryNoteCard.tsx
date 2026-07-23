"use client";

import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";
import type { ChartId } from "@/lib/stories";

// Desktop note that sits beside its chart (right column of the section). Sticky
// positioning is applied by the parent so it rides along while you scroll through
// a tall chart, then scrolls away with the section. Mobile uses StoryChartNote.
export function StoryNoteCard({ target }: { target: ChartId }) {
  const { storyResult, activeStory, storyHeadlines } = useExplorer();
  const note = storyResult?.notes?.[target];
  if (!note) return null;
  const chip = storyHeadlines.find((h) => h.id === activeStory)?.chip ?? "Story";
  return (
    <div
      className="rounded-lg border-l-2 p-3"
      style={{ borderColor: ACCENT, background: "rgba(192,16,35,0.04)" }}
    >
      <div
        className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: ACCENT }}
      >
        {chip}
      </div>
      <p className="text-sm leading-snug" style={{ color: INK.secondary }}>
        {note}
      </p>
    </div>
  );
}
