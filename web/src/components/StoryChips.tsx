"use client";

import { useExplorer } from "@/lib/store";
import { hairline, useTheme } from "@/lib/theme";

// The computed findings as clickable invitations. Each chip carries the story's
// short label and, under it, the finding itself: the punchline used to be locked
// behind the click that activated the story, which hid the best line on the page
// from anyone who never made it. Clicking one activates that story (filters +
// chart focus), clicking the active one clears back to free exploration.
export function StoryChips() {
  const { storyHeadlines, activeStory, setStory } = useExplorer();
  const { tokens } = useTheme();
  if (storyHeadlines.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Findings to explore">
      {storyHeadlines.map(({ id, chip, teaser }) => {
        const active = activeStory === id;
        return (
          <button
            key={id}
            onClick={() => setStory(active ? null : id)}
            aria-pressed={active}
            className="group inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-left text-xs transition"
            style={{
              borderColor: active
                ? tokens.ui.active
                : hairline(tokens.ink.primary, 18),
              background: active ? tokens.ui.active : "transparent",
              color: active ? tokens.ui.activeText : tokens.ink.secondary,
            }}
          >
            <span className="flex flex-col">
              <span>{chip}</span>
              {teaser ? (
                <span
                  className="text-[11px] leading-snug"
                  style={{
                    // `ink.muted` is the tone this line wants, and it is what it
                    // gets on the eight chips that are not active. On the active
                    // one the ground is ink, and muted ink on ink falls to about
                    // 2:1, so the second line takes the active text colour held
                    // back instead. Same relationship, legible on both grounds.
                    color: active
                      ? `color-mix(in srgb, ${tokens.ui.activeText} 78%, transparent)`
                      : tokens.ink.muted,
                  }}
                >
                  {teaser}
                </span>
              ) : null}
            </span>
            <span aria-hidden className="text-[13px] leading-none opacity-70">
              {active ? "✕" : "→"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
