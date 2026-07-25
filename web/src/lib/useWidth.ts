"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Track an element's rendered width, for charts that lay out in a 1:1 pixel
 * space rather than a scaled viewBox.
 *
 * A `viewBox` chart scales its type along with its geometry, which is right for
 * a bar list and wrong for a plot: at 1200px the axis labels would balloon, at
 * 375px they would shrink past reading. These charts draw at the width they
 * actually occupy and leave the font sizes alone.
 *
 * `initial` is what renders before the observer fires, which includes the static
 * export's HTML, so it should be the width the chart usually gets.
 *
 * `min` is a floor, not a clamp on the element: below it the caller's
 * `maxWidth: "100%"` keeps the SVG from widening its own container. Leave it at
 * 0 for charts small enough to lay out at any width.
 *
 * CALLER REQUIREMENT: the observed element must sit in a track whose width does
 * not depend on its contents. A bare `display: grid` gives an implicit
 * `max-content` column, so the column asks the SVG how wide it wants to be while
 * the SVG is asking the column the same question. That resolves to whatever
 * `initial` was and never moves again. Use `grid-cols-1` (an explicit
 * `minmax(0, 1fr)`), a block parent, or any definite width.
 */
export function useWidth(
  initial = 360,
  min = 0,
): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(w, min)];
}
