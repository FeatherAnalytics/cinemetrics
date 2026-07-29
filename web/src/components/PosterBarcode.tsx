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

/**
 * The readout under the barcode.
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
  const [hover, setHover] = useState<EnrichedWatch | null>(null);

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

  const at = (clientX: number): EnrichedWatch | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const i = Math.floor(((clientX - rect.left) / rect.width) * watches.length);
    return watches[Math.max(0, Math.min(watches.length - 1, i))] ?? null;
  };

  const poster = hover ? posterUrl(hover.film?.poster) : null;

  return (
    <figure className="m-0">
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
          const w = at(e.clientX);
          if (w) setSelected(w.tmdb_id);
        }}
      />
      {/* The caption holds its height whether or not a film is hovered, so the
          page below does not jump as the pointer crosses the barcode. */}
      <figcaption
        className="mt-2 flex min-h-[62px] items-center gap-3 text-sm"
        style={{ color: tokens.ink.secondary }}
      >
        {hover ? (
          <>
            {poster && (
              /* A plain img, not next/image: this is a static export, so the
                 optimizer is unavailable and would need `unoptimized` anyway. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                style={{ width: 38, aspectRatio: "2/3", objectFit: "cover", borderRadius: 2 }}
              />
            )}
            <span>
              <span className="font-semibold" style={{ color: tokens.ink.primary }}>
                {hover.film?.title ?? hover.tmdb_id}
              </span>
              <br />
              {barcodeLabel({
                date: hover.date,
                genre: primaryGenre(hover.film),
                rating: hover.rating,
              })}
            </span>
          </>
        ) : (
          <span style={{ color: tokens.ink.muted }}>
            {watches.length} watches. Hover for the film.
          </span>
        )}
      </figcaption>
    </figure>
  );
}
