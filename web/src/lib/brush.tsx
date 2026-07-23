"use client";

// Shared drag-to-brush helper for the SVG charts. Selection is expressed as a
// set of watch keys and applied as a cross-filter in the store (see filterWatches).

import { useRef, useState } from "react";
import { ACCENT } from "./palette";
import type { EnrichedWatch } from "./types";

export type BrushRect = { x0: number; y0: number; x1: number; y1: number };

/**
 * The shared drag-selection overlay: a faint accent rectangle drawn over the
 * brushed region. Null-safe so call sites can render it unconditionally.
 */
export function BrushRectOverlay({ rect }: { rect: BrushRect | null }) {
  if (!rect) return null;
  return (
    <rect
      x={rect.x0}
      y={rect.y0}
      width={rect.x1 - rect.x0}
      height={rect.y1 - rect.y0}
      fill={ACCENT}
      fillOpacity={0.08}
      stroke={ACCENT}
      strokeOpacity={0.5}
      strokeWidth={1}
      pointerEvents="none"
    />
  );
}

/** Stable per-watch identity (a film can be watched on several dates). */
export function watchKey(w: EnrichedWatch): string {
  return `${w.tmdb_id}:${w.date}`;
}

export function rectContains(r: BrushRect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

const THRESHOLD = 4; // px of movement before a press becomes a brush (vs a click)

/**
 * Rectangular drag brush over an SVG, in the SVG's own viewBox units. Returns
 * the live rectangle to render plus pointer handlers to spread on the <svg>.
 * A press that never moves past THRESHOLD is left alone, so existing click
 * handlers on marks keep working; a real drag captures the pointer and, on
 * release, calls onCommit with the final rectangle.
 */
export function useDragRect(
  viewBox: () => { w: number; h: number },
  onCommit: (rect: BrushRect) => void,
) {
  const [rect, setRect] = useState<BrushRect | null>(null);
  const rectRef = useRef<BrushRect | null>(null); // latest rect, readable synchronously on pointerup
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const update = (r: BrushRect | null) => {
    rectRef.current = r;
    setRect(r);
  };

  const toLocal = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { w, h } = viewBox();
    return {
      x: ((e.clientX - r.left) / r.width) * w,
      y: ((e.clientY - r.top) / r.height) * h,
    };
  };

  return {
    rect,
    isDragging: () => dragging.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        start.current = toLocal(e);
        dragging.current = false;
        update(null);
      },
      onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
        const s = start.current;
        if (!s) return;
        const p = toLocal(e);
        if (!dragging.current && (Math.abs(p.x - s.x) > THRESHOLD || Math.abs(p.y - s.y) > THRESHOLD)) {
          dragging.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not fatal */
          }
        }
        if (dragging.current) {
          update({
            x0: Math.min(s.x, p.x),
            y0: Math.min(s.y, p.y),
            x1: Math.max(s.x, p.x),
            y1: Math.max(s.y, p.y),
          });
        }
      },
      onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
        const r = rectRef.current;
        const wasDrag = dragging.current;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        start.current = null;
        dragging.current = false;
        update(null);
        if (wasDrag && r) onCommit(r);
      },
    },
  };
}
