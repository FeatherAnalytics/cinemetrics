"use client";

import { useEffect, useRef } from "react";
import { useExplorer } from "@/lib/store";
import type { ChartId } from "@/lib/stories";

export function StoryAnnotation({ target }: { target: ChartId }) {
  const { activeStory, storyResult, storyFocus } = useExplorer();
  const ref = useRef<HTMLDivElement>(null);

  const isTarget = storyFocus?.primary === target;

  useEffect(() => {
    if (isTarget && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStory, isTarget]);

  if (!activeStory || !storyResult || !isTarget) return null;

  return (
    <div
      ref={ref}
      className="mb-3 rounded-r-lg py-2 pl-3 pr-4"
      style={{ borderLeft: "3px solid #c01023", background: "#faf5f0" }}
    >
      <p className="text-sm font-semibold text-[#0b0b0b]">{storyResult.headline}</p>
      {storyResult.subtext && (
        <p className="mt-0.5 text-xs text-[#67655f]">{storyResult.subtext}</p>
      )}
      {storyResult.extras}
    </div>
  );
}
