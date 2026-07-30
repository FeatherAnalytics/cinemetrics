"use client";

import { tipLeft } from "@/components/PosterBarcode";
import { useTheme } from "@/lib/theme";

/**
 * The hover readout the lab charts share.
 *
 * Same treatment as the barcode's and the swim lane's, deliberately: an inverted
 * `ink.primary` panel with `ink.surface` type, no pointer events, placed at the
 * cursor. A reader who has learned what a tooltip looks like on the main page
 * should not have to learn a second one here.
 *
 * The clamp is the barcode's `tipLeft` rather than a second copy of the same
 * arithmetic. Both of these charts run the full width of their card, so both hit
 * the problem it solves: a box merely centered on the pointer hangs off the left
 * edge at the first point and off the right edge at the last. It is imported from
 * the barcode because that is where it is unit tested, against every watch the
 * site ships.
 */

/**
 * Fixed, for the barcode's reason: the clamp has to know the width before the box
 * is laid out, and measuring would make the placement depend on which point the
 * pointer happened to be over. Wide enough for "Ordinary days" over a figure with
 * its interval, narrow enough to fit twice inside a 390px card.
 */
export const LAB_TIP_W = 184;

/**
 * Two lines of this type plus padding. Declared rather than measured for the same
 * reason as the width: the flip below has to know it before layout.
 */
const LAB_TIP_H = 42;

const GAP = 12;

/**
 * Vertical placement: under the cursor, or over it when there is no room under.
 *
 * The era panels are 150px tall and the bar panels 90, so a box pinned below the
 * pointer would hang past the bottom of the card whenever the pointer is in the
 * lower half of a plot. Flipping keeps it inside the figure at every pointer
 * position instead of only at the ones a screenshot happened to catch.
 */
export function tipTop(y: number, figH: number, tipH = LAB_TIP_H, gap = GAP): number {
  return y + gap + tipH > figH ? Math.max(0, y - gap - tipH) : y + gap;
}

export function LabTip({
  x,
  y,
  figW,
  figH,
  title,
  detail,
}: {
  /** Pointer position within the figure, in pixels from its top left. */
  x: number;
  y: number;
  figW: number;
  figH: number;
  title: string;
  detail: string;
}) {
  const { tokens } = useTheme();
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
      style={{
        left: tipLeft(x, figW, LAB_TIP_W),
        top: tipTop(y, figH),
        width: LAB_TIP_W,
        background: tokens.ink.primary,
        color: tokens.ink.surface,
      }}
    >
      <div className="font-medium">{title}</div>
      {/* A dimmed version of the tooltip's own text color, not a fixed gray: the
          panel is ink.primary, which inverts with the theme, so the muted tone
          has to invert with it. */}
      <div className="tabular-nums" style={{ color: tokens.ink.surface, opacity: 0.75 }}>
        {detail}
      </div>
    </div>
  );
}
