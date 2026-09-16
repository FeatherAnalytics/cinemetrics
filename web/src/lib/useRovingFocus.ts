"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Roving focus for SVG groups with many marks. The group gets tabIndex=0;
 * ArrowLeft/Right move an active index among marks, Enter/Space invoke
 * the mark's handler. aria-activedescendant points at the active mark.
 */
export function useRovingFocus(count: number, onActivate: (index: number) => void) {
  const [active, setActive] = useState(-1);
  const groupRef = useRef<SVGSVGElement | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (count === 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, count - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (active >= 0 && active < count) onActivate(active);
      }
    },
    [count, active, onActivate],
  );

  const onFocus = useCallback(() => {
    if (active < 0) setActive(0);
  }, [active]);

  const groupProps = {
    ref: groupRef,
    tabIndex: 0,
    role: "group" as const,
    className: "chart-mark",
    onKeyDown,
    onFocus,
    "aria-activedescendant": active >= 0 ? `rv-mark-${active}` : undefined,
  };

  const markId = (index: number) => `rv-mark-${index}`;

  return { active, groupProps, markId };
}
