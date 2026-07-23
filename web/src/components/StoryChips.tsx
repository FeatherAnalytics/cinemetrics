"use client";

import { useExplorer } from "@/lib/store";
import { ACCENT, INK } from "@/lib/palette";

// The computed findings as clickable invitations. Each chip carries the
// headline the story would print on its primary chart; clicking one activates
// that story (filters + chart focus), clicking the active one clears back to
// free exploration.
export function StoryChips() {
  const { storyHeadlines, activeStory, setStory } = useExplorer();
  if (storyHeadlines.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Findings to explore">
      {storyHeadlines.map(({ id, chip }) => {
        const active = activeStory === id;
        return (
          <button
            key={id}
            onClick={() => setStory(active ? null : id)}
            aria-pressed={active}
            className="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-left text-xs transition"
            style={{
              borderColor: active ? ACCENT : "rgba(11,11,11,0.18)",
              background: active ? ACCENT : "transparent",
              color: active ? INK.surface : INK.secondary,
            }}
          >
            <span>{chip}</span>
            <span aria-hidden className="text-[13px] leading-none opacity-70">
              {active ? "✕" : "→"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
