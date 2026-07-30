"use client";

import type { CandidateMetadata } from "@/lib/recommend";
import type { Reason } from "@/lib/explainClient";
import { GENRE_ORDER, type GenreKey } from "@/lib/palette";
import { posterUrl } from "@/lib/fourFavs";
import { useTheme } from "@/lib/theme";

type Props = {
  metadata: CandidateMetadata;
  score: number;
  reasons: Reason[];
  /** Already on the Letterboxd watchlist — badged so a hit reads as a hit. */
  onWatchlist?: boolean;
};

// Letterboxd's own three-circle mark, reproduced at its real brand colors.
// Fixed rather than themed: this identifies a third-party site, not our ink
// scale, and stays recognizable regardless of which theme is active.
function LetterboxdIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" style={{ opacity: 0.7 }}>
      <circle cx="250" cy="250" r="240" fill="none" stroke="#00e054" strokeWidth="28" />
      <circle cx="175" cy="250" r="80" fill="#ff8000" opacity="0.85" />
      <circle cx="325" cy="250" r="80" fill="#00e054" opacity="0.85" />
      <ellipse cx="250" cy="250" rx="30" ry="75" fill="#fff" opacity="0.7" />
    </svg>
  );
}

function letterboxdSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Letterboxd resolves /imdb/{id}/ to the correct film page via redirect, which
// avoids guessing the slug (its slugs only append the year for disambiguation).
// Fall back to a title slug for the rare film with no imdb_id.
function letterboxdUrl(m: CandidateMetadata): string {
  if (m.imdb_id) return `https://letterboxd.com/imdb/${m.imdb_id}/`;
  return `https://letterboxd.com/film/${letterboxdSlug(m.title)}/`;
}

// GENRE_ORDER is the five tracked, color-carrying genres (no "Other"), so a
// genre string in this set maps directly to a GENRE_COLORS swatch.
const GENRE_KEY_SET = new Set<string>(GENRE_ORDER);

/**
 * Poster box, in CSS pixels. Every TMDB sheet is 2:3, so the height follows.
 *
 * Both are also written as `width`/`height` attributes on the image. The drawer
 * holds up to ten cards and the reader scrolls while the posters are still
 * arriving over the network, so the row has to hold its final height from the
 * first paint. An image with no stated size collapses to nothing and then pushes
 * everything below it down as it loads.
 */
const POSTER_W = 58;
const POSTER_H = 87;

/** The three genres the card has room for beside a poster. */
const MAX_GENRE_PILLS = 3;

export function FilmCard({ metadata, score, reasons, onWatchlist }: Props) {
  const { tokens } = useTheme();
  const m = metadata;
  const genres = m.genres ? m.genres.split(", ").filter(Boolean) : [];
  const isEnglish = m.language === "en";
  const langLabel = isEnglish ? "EN" : (m.language || "").toUpperCase();
  const filmUrl = letterboxdUrl(m);

  const runtimeStr = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : null;
  // Joined rather than concatenated with a separator per field: a candidate with
  // no release date used to open its meta line with a stray separator, and the
  // films TMDB records least are the same ones it has no poster for.
  const meta = [m.year, runtimeStr, m.rated].filter(Boolean).join(" · ");
  const poster = posterUrl(m.poster);

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        background: tokens.surface.card,
        borderColor: `color-mix(in srgb, ${tokens.ink.primary} 12%, transparent)`,
      }}
    >
      <div className="flex gap-2.5 p-3">
        {/* 250 of the 7,770 candidates have no art on TMDB, so a missing poster
            is an ordinary state and not a failure. Those cards drop the column
            entirely and let the text run the full width, which reads as a
            deliberate layout rather than as a picture that failed to load. */}
        {poster && (
          /* A plain img, not next/image: this is a static export, so the
             optimizer is unavailable and would need `unoptimized` anyway. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            width={POSTER_W}
            height={POSTER_H}
            loading="lazy"
            decoding="async"
            style={{
              width: POSTER_W,
              aspectRatio: "2/3",
              objectFit: "cover",
              borderRadius: 3,
              flexShrink: 0,
              // A flex child stretches to the row's height by default, which on a
              // card with three reason lines drew the poster at 58x104 and broke
              // the ratio the reserved box was sized for.
              alignSelf: "flex-start",
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: tokens.ink.primary }}>
                  {m.title}
                </span>
                <a
                  href={filmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Letterboxd"
                  className="flex-shrink-0"
                >
                  <LetterboxdIcon />
                </a>
                {/* Already shortlisted. Sits beside the Letterboxd mark because it
                    is the same kind of fact — where this film already exists for
                    me — rather than something the recommender computed. */}
                {onWatchlist && (
                  <span
                    className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                    style={{
                      background: tokens.accent,
                      // The hole-punch ink, not a fixed light gray: it has to read
                      // against the accent fill in both themes, and INK.surface
                      // already flips to whichever tone contrasts with it.
                      color: tokens.ink.surface,
                      letterSpacing: "0.12em",
                      // The tracking pushes the last letter off-centre inside the
                      // pill, so the right pad absorbs it back.
                      paddingRight: "0.28rem",
                      lineHeight: 1.35,
                    }}
                    title="Already on my Letterboxd watchlist"
                  >
                    WL
                  </span>
                )}
              </div>
              <div className="text-[11px]" style={{ color: tokens.ink.muted }}>
                {meta}
              </div>
            </div>
            {score > 0 && (
              <span
                className="whitespace-nowrap font-mono text-[10px] font-medium"
                style={{ color: tokens.accent }}
              >
                {Math.round(score * 100)}% match
              </span>
            )}
          </div>

          {/* The reasons the recommender already computed, stated plainly. They
              carried a label and a bullet each when they sat in their own panel;
              beside a poster the panel is what has to go, and a short line of
              secondary ink under the title reads as the caption it always was. */}
          {reasons.length > 0 && (
            <div className="mb-2 flex flex-col gap-0.5">
              {reasons.map((r, i) => (
                <span
                  key={i}
                  className="leading-snug"
                  style={{ fontSize: "12.5px", color: tokens.ink.secondary }}
                >
                  {r.text}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {genres.slice(0, MAX_GENRE_PILLS).map((g) => {
              const key = GENRE_KEY_SET.has(g) ? (g as GenreKey) : null;
              return (
                <span
                  key={g}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{
                    background: `color-mix(in srgb, ${tokens.ink.primary} 5%, transparent)`,
                    color: tokens.ink.secondary,
                  }}
                >
                  {key && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: tokens.genre[key] }}
                    />
                  )}
                  {g}
                </span>
              );
            })}
            <span
              className="rounded-full border px-1.5 py-0.5 text-[10px]"
              style={{
                borderColor: `color-mix(in srgb, ${tokens.ink.primary} 18%, transparent)`,
                color: tokens.ink.muted,
              }}
            >
              {langLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
