"use client";

import { useEffect, useRef } from "react";
import { getStoryById, useExplorer } from "@/lib/store";
import { LANDING_STORY, type ChartId } from "@/lib/stories";
import { useTheme } from "@/lib/theme";

export function StoryAnnotation({ target }: { target: ChartId }) {
  const { activeStory, storyResult, storyFocus } = useExplorer();
  const { tokens } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  const isTarget = storyFocus?.primary === target;

  useEffect(() => {
    // A #chart-… hash means the visitor followed a deep link to a specific
    // chart — let the browser's anchor scroll win over the story's auto-scroll.
    // Interacting with any control rewrites the URL without the hash, so
    // in-session story switches scroll normally.
    if (window.location.hash.startsWith("#chart-")) return;
    // A story that swapped the whole chart set starts at the top of the page, so
    // scrolling to its primary would skip charts the reader has not seen. The
    // landing story is consulted the same way, and says the same thing: a page that
    // scrolls itself on first load is a page that took the scroll away from the
    // reader before they asked for anything.
    const cfg = activeStory ? getStoryById(activeStory) : LANDING_STORY;
    if (cfg?.scrollToPrimary === false) return;
    if (isTarget && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStory, isTarget]);

  // No `activeStory` check: with nothing selected this renders the LANDING story's
  // headline, which is the one line on the page that states a finding rather than
  // describing a chart.
  if (!storyResult || !isTarget) return null;

  // The primary chart's note renders here, inside the headline bar, so the
  // chart carries a single story element (secondary charts get StoryChartNote,
  // styled identically).
  const note = storyResult.notes?.[target];

  return (
    <div
      ref={ref}
      className="mb-2 rounded-r-lg py-2 pl-3 pr-4"
      style={{
        borderLeft: `3px solid ${tokens.accent}`,
        background: `color-mix(in srgb, ${tokens.accent} 8%, ${tokens.surface.paper})`,
      }}
    >
      <p className="text-sm font-semibold" style={{ color: tokens.ink.primary }}>{storyResult.headline}</p>
      {storyResult.subtext && (
        <p className="mt-0.5 text-xs" style={{ color: tokens.ink.muted }}>{storyResult.subtext}</p>
      )}
      {note && <p className="mt-0.5 text-xs" style={{ color: tokens.ink.secondary }}>{note}</p>}
      {storyResult.extras}
    </div>
  );
}
