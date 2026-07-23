"use client";

import { useExplorer } from "@/lib/store";
import { useRecommend } from "@/lib/recommendStore";
import { ACCENT, INK } from "@/lib/palette";
import { CHART_TITLES, type ChartId } from "@/lib/stories";

// Desktop-only right panel that narrates the active story chart by chart. Reuses
// the recommend drawer's placement/styling and yields to it: when the recommend
// drawer is open it takes the space; with no story and no recs, nothing shows.
// Mobile uses inline notes (StoryChartNote) instead.
export function StoryPanel() {
  const { activeStory, storyResult, storyHeadlines, setStory } = useExplorer();
  const { state: recState } = useRecommend();

  if (!activeStory || !storyResult || recState.open) return null;

  const notes = storyResult.notes ?? {};
  const entries = (Object.keys(notes) as ChartId[])
    .filter((id) => notes[id])
    .map((id) => [id, notes[id] as string] as const);
  if (entries.length === 0) return null;

  const chip = storyHeadlines.find((h) => h.id === activeStory)?.chip ?? "Story";

  return (
    <aside
      className="fixed right-0 top-0 z-40 hidden h-full w-[360px] flex-col overflow-y-auto border-l lg:flex"
      style={{ background: INK.surface, borderColor: ACCENT }}
      aria-label="Story detail"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: ACCENT }}
          >
            {chip}
          </span>
          <button
            onClick={() => setStory(null)}
            aria-label="Close story"
            className="text-lg leading-none"
            style={{ color: INK.muted }}
          >
            ✕
          </button>
        </div>

        <p className="mb-5 font-display text-base font-semibold" style={{ color: INK.primary }}>
          {storyResult.headline}
        </p>

        <div className="flex flex-col gap-4">
          {entries.map(([id, text]) => (
            <div key={id}>
              <div
                className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: INK.muted }}
              >
                {CHART_TITLES[id]}
              </div>
              <p className="text-sm leading-snug" style={{ color: INK.secondary }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
