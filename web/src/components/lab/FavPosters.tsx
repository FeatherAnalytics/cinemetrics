"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { INK } from "@/lib/palette";
import { favColor, StarMarker } from "@/lib/favMarker";
import { FOUR_FAVS, posterUrl } from "@/lib/fourFavs";
import { isPicked, pickWatches } from "@/components/stats/pick";
import type { EnrichedWatch } from "@/lib/types";

/**
 * The four posters, as the header for the favorites story.
 *
 * Hotlinked from TMDB's CDN rather than committed to the repo. Four images is not
 * the case W16 was worried about: that was 794 posters at ~6MB, which had to
 * become one composite PNG. Four thumbnails at `w342` are a handful of requests
 * to a CDN built to serve them, and keeping them out of the repo means the
 * curated choice is one line of config rather than a binary.
 *
 * KEPT IN CURATED ORDER, which is the profile's order and not any order the data
 * would produce. Sorting these by rating or by watch count would be inventing a
 * ranking the four do not have, and the whole finding next to it is that no
 * ordering in the data reproduces this list.
 *
 * Films the current filter excludes are dimmed rather than dropped. All four are
 * always the four; a filter that hides one is a statement about the filter.
 */

const RATIO = 3 / 2; // TMDB posters are 2:3

type Card = {
  tmdb_id: number;
  title: string;
  src: string | null;
  /** boxd.it short link to the film's Letterboxd page. */
  href: string;
  watches: EnrichedWatch[];
};

export function FavPosters() {
  const { all, filtered, filters, setSelection } = useExplorer();
  // Which posters failed to load, so a broken path degrades to a readable card
  // instead of a browser's broken-image glyph.
  const [failed, setFailed] = useState<Record<number, true>>({});

  const cards: Card[] = useMemo(() => {
    const byFilm = new Map<number, EnrichedWatch[]>();
    for (const w of all) {
      const bucket = byFilm.get(w.tmdb_id);
      if (bucket) bucket.push(w);
      else byFilm.set(w.tmdb_id, [w]);
    }
    return FOUR_FAVS.map((f) => {
      const watches = byFilm.get(f.tmdb_id) ?? [];
      return {
        tmdb_id: f.tmdb_id,
        title: watches[0]?.film?.title ?? f.title,
        // The short link the id was resolved FROM, so it cannot drift from the film
        // this card is about the way a rebuilt slug could.
        href: `https://boxd.it/${f.letterboxd}`,
        src: posterUrl(watches[0]?.film?.poster),
        watches,
      };
    });
  }, [all]);

  const inView = useMemo(() => new Set(filtered.map((w) => w.tmdb_id)), [filtered]);

  return (
    <figure className="m-0">
      <ul className="grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-4">
        {cards.map((c) => {
          const film = c.watches[0]?.film;
          const on = isPicked(c.watches, filters.selection);
          const out = c.watches.length > 0 && !inView.has(c.tmdb_id);
          const broken = c.src == null || failed[c.tmdb_id];
          return (
            <li key={c.tmdb_id} style={{ opacity: out ? 0.35 : 1 }}>
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                aria-label={`${c.title} on Letterboxd`}
              >
                <div
                  className="relative w-full overflow-hidden rounded"
                  style={{
                    aspectRatio: `${1} / ${RATIO}`,
                    background: "#eceae3",
                    outline: on ? `2px solid ${INK.primary}` : "none",
                    outlineOffset: 1,
                  }}
                >
                  {broken ? (
                    /* No art available. Says so in words rather than leaving a
                       pale rectangle that reads as a loading state that never
                       finishes. */
                    <span
                      className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs"
                      style={{ color: INK.muted }}
                    >
                      no poster
                    </span>
                  ) : (
                    /* A plain img, not next/image: this is a static export, so
                       the optimizer is unavailable and would need `unoptimized`
                       anyway. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.src ?? undefined}
                      alt={`${c.title} poster`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={() => setFailed((f) => ({ ...f, [c.tmdb_id]: true }))}
                    />
                  )}
                </div>
              </a>
              <button
                type="button"
                className="mt-1.5 block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                onClick={() => pickWatches(c.watches, filters.selection, setSelection)}
              >
                <div className="flex items-start gap-1.5">
                  <svg width={13} height={13} className="mt-0.5 shrink-0" aria-hidden>
                    <StarMarker x={6.5} y={6.5} r={6} fill={favColor(film)} />
                  </svg>
                  <span
                    className="text-sm font-bold leading-tight"
                    style={{ color: INK.primary }}
                  >
                    {c.title}
                  </span>
                </div>
                {film?.director && (
                  <div className="text-xs" style={{ color: INK.muted }}>
                    {film.director}
                    {film.year != null ? `, ${film.year}` : ""}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-2 text-[10px]" style={{ color: INK.muted }}>
        Poster art from TMDB. This product uses the TMDB API but is not endorsed or
        certified by TMDB.
      </figcaption>
    </figure>
  );
}
