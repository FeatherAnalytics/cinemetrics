"use client";

import { useEffect, useRef } from "react";
import { useExplorer } from "@/lib/store";
import type { ChartId } from "@/lib/stories";

export function StoryAnnotation({ target }: { target: ChartId }) {
  const { activeStory, storyResult, storyFocus } = useExplorer();
  const ref = useRef<HTMLDivElement>(null);

  const isTarget = storyFocus?.primary === target;

  useEffect(() => {
    // A #chart-… hash means the visitor followed a deep link to a specific
    // chart — let the browser's anchor scroll win over the story's auto-scroll.
    // Interacting with any control rewrites the URL without the hash, so
    // in-session story switches scroll normally.
    if (window.location.hash.startsWith("#chart-")) return;
    if (isTarget && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStory, isTarget]);

  if (!activeStory || !storyResult || !isTarget) return null;

  // The primary chart's note renders here, inside the headline bar, so the
  // chart carries a single story element (secondary charts get StoryChartNote,
  // styled identically).
  const note = storyResult.notes?.[target];

  return (
    <div
      ref={ref}
      className="mb-2 rounded-r-lg py-2 pl-3 pr-4"
      style={{ borderLeft: "3px solid #c01023", background: "#faf5f0" }}
    >
      <p className="text-sm font-semibold text-[#0b0b0b]">{storyResult.headline}</p>
      {storyResult.subtext && (
        <p className="mt-0.5 text-xs text-[#67655f]">{storyResult.subtext}</p>
      )}
      {note && <p className="mt-0.5 text-xs text-[#3d3c38]">{note}</p>}
      {storyResult.extras}
    </div>
  );
}
