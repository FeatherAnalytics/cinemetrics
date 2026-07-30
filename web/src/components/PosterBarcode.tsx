"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useExplorer } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { starLabel } from "@/lib/likedChart";
import { primaryGenre } from "@/lib/palette";
import { sliceStops } from "@/lib/posterSlice";
import { posterUrl } from "@/lib/fourFavs";
import type { EnrichedWatch } from "@/lib/types";

// Canvas, not SVG. 795 watches at 20 stops each is 15,900 rects, and the SVG
// barcode next door already draws 795 of them.
const H = 132;

// The hover tooltip. A fixed width rather than a shrink-to-fit box, because the
// edge clamp below has to know how wide the thing is before it is laid out, and
// titles run from "Us" to "Everything Everywhere All at Once": measuring would
// make the clamp depend on which film the pointer happens to be over.
const TIP_W = 252;
const TIP_PAD = 4;

// 72px wide, so 108 tall at the 2:3 a poster always is. The old 38px was sized
// to fit a caption strip and showed a smudge; 72 is roughly the point where the
// art, the title treatment and a face become recognisable. It also keeps the
// whole tooltip under the barcode's own 132px height, so the readout stays
// smaller than the hero it describes.
const POSTER_W = 72;

/**
 * The tooltip's left edge, in pixels from the figure's left, for a pointer at
 * `x` over a figure `figW` wide.
 *
 * The barcode spans the full card, so a box merely centred on the pointer hangs
 * off the page at both ends: the first stripe would put half the tooltip left of
 * zero and the last would push it past the right edge. Clamping the left edge
 * into [pad, figW - TIP_W - pad] keeps it on screen and lets it slide along the
 * end of the barcode instead. When the figure is narrower than the tooltip the
 * lower bound wins, which pins it flush left rather than off screen.
 */
export function tipLeft(x: number, figW: number, tipW = TIP_W, pad = TIP_PAD): number {
  return Math.max(pad, Math.min(x - tipW / 2, figW - tipW - pad));
}

/**
 * The barcode's hover readout.
 *
 * Ratings are shown in STARS. my_rating is 0-100 and star_rating is 0-5 with a
 * factor of exactly 20; starLabel is the same helper the rating axes use, so
 * this reads "4★" rather than "4.0★" or "80".
 */
export function barcodeLabel(w: {
  date: string;
  genre: string;
  rating: number | null;
}): string {
  const parts = [w.date, w.genre];
  if (w.rating != null) parts.push(starLabel(w.rating / 20));
  return parts.join(" · ");
}

export function PosterBarcode() {
  const { filtered, setSelected } = useExplorer();
  const { tokens } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // x and figW travel with the watch: both come off the same getBoundingClientRect
  // as the hit test, so the tooltip is placed from the geometry that picked the
  // film rather than from a second, later measurement.
  const [hover, setHover] = useState<{ x: number; figW: number; w: EnrichedWatch } | null>(null);

  const watches = useMemo(
    () => [...filtered].sort((a, b) => a.d.getTime() - b.d.getTime()),
    [filtered],
  );

  // Stops are parsed once per film, not once per watch: a film watched eight
  // times would otherwise re-split the same 120 characters eight times.
  const stopsByFilm = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const w of watches) {
      if (!m.has(w.tmdb_id)) m.set(w.tmdb_id, sliceStops(w.film?.slice));
    }
    return m;
  }, [watches]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || watches.length === 0) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      canvas.width = w * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, H);

      // ink.mark, not ink.grid. The two match in light mode, but a stripe here
      // is a solid full-height mark, and grid is the deliberately dim gridline
      // tone: against the dark card it lands at 1.47:1, so the stripe would all
      // but vanish from a row of full-color neighbors. mark is the token that
      // exists for a mark carrying no categorical color, and it reaches 3.70:1.
      const noSlice = tokens.ink.mark;

      const bw = w / watches.length;
      watches.forEach((wt, i) => {
        const stops = stopsByFilm.get(wt.tmdb_id) ?? [];
        const x = i * bw;
        if (stops.length === 0) {
          ctx.fillStyle = noSlice;
          ctx.fillRect(x, 0, Math.ceil(bw) + 0.5, H);
          return;
        }
        const sh = H / stops.length;
        stops.forEach((c, k) => {
          ctx.fillStyle = c;
          ctx.fillRect(x, k * sh, Math.ceil(bw) + 0.5, Math.ceil(sh) + 0.5);
        });
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [watches, stopsByFilm, tokens]);

  if (watches.length === 0) return null;

  const at = (clientX: number): { x: number; figW: number; w: EnrichedWatch } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const i = Math.floor((x / rect.width) * watches.length);
    const w = watches[Math.max(0, Math.min(watches.length - 1, i))];
    return w ? { x, figW: rect.width, w } : null;
  };

  const poster = hover ? posterUrl(hover.w.film?.poster) : null;

  return (
    // Relative, so the tooltip is placed against the figure. The figure is the
    // canvas's own box, so a pointer offset measured off the canvas is already
    // in the tooltip's coordinate space.
    <figure className="relative m-0">
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: H, cursor: "pointer" }}
        role="img"
        // getUTCFullYear against a date parsed as UTC midnight. Local time would
        // shift a January 1st watch back into the previous year.
        aria-label={`Every watch since ${watches[0].d.getUTCFullYear()}, in order, as a slice of its own poster`}
        onMouseMove={(e) => setHover(at(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = at(e.clientX);
          if (hit) setSelected(hit.w.tmdb_id);
        }}
      />

      {/* Clear of the canvas rather than of the pointer, and BELOW it.
          The swim lane hangs its tooltip off the point's own y, but every stripe
          here spans the full 132px: following the pointer's y would bob the box up
          and down a film's height for no information and would sit the readout on
          top of the hero. Anchored to an edge it tracks the pointer sideways only
          and the barcode stays whole. Below rather than above because a 124px box
          lifted over the canvas covers this section's own heading, its blurb and
          the story chips above them, while downward it covers the caption, which
          is the one line the tooltip has just made redundant. */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 flex gap-2 rounded-md p-2 text-xs shadow"
          style={{
            left: tipLeft(hover.x, hover.figW),
            top: H + 8,
            width: TIP_W,
            background: tokens.ink.primary,
            color: tokens.ink.surface,
          }}
        >
          {poster && (
            /* A plain img, not next/image: this is a static export, so the
               optimizer is unavailable and would need `unoptimized` anyway. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              style={{
                width: POSTER_W,
                flexShrink: 0,
                aspectRatio: "2/3",
                objectFit: "cover",
                borderRadius: 2,
              }}
            />
          )}
          {/* min-w-0 so a long title wraps inside the fixed width instead of
              pushing the box wider than the clamp was told it is. */}
          <div className="min-w-0">
            <div className="font-medium break-words">
              {hover.w.film?.title ?? hover.w.tmdb_id}
            </div>
            {/* A dimmed version of the tooltip's own text color, not a fixed gray:
                the background is ink.primary (inverted relative to the page), so
                the muted tone has to invert with it too. */}
            <div style={{ color: tokens.ink.surface, opacity: 0.75 }}>
              {barcodeLabel({
                date: hover.w.date,
                genre: primaryGenre(hover.w.film),
                rating: hover.w.rating,
              })}
            </div>
          </div>
        </div>
      )}

      {/* The count and the invitation stay on the page instead of moving into the
          tooltip. They are the only thing telling a reader the barcode answers to
          a pointer at all, and a hover affordance that only appears on hover is no
          affordance. Static now, so unlike the readout it used to hold there is
          nothing left that can change height under the pointer. */}
      <figcaption className="mt-2 text-sm" style={{ color: tokens.ink.muted }}>
        {watches.length} watches. Hover for the film.
      </figcaption>
    </figure>
  );
}
