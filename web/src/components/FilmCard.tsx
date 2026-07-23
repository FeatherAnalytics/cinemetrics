"use client";

import type { CandidateMetadata } from "@/lib/recommend";
import type { Reason } from "@/lib/explainClient";
import { ACCENT, GENRE_COLORS, GENRE_ORDER, INK, type GenreKey } from "@/lib/palette";

type Props = {
  metadata: CandidateMetadata;
  score: number;
  reasons: Reason[];
};

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

// GENRE_ORDER is the five tracked, colour-carrying genres (no "Other"), so a
// genre string in this set maps directly to a GENRE_COLORS swatch.
const GENRE_KEY_SET = new Set<string>(GENRE_ORDER);

export function FilmCard({ metadata, score, reasons }: Props) {
  const m = metadata;
  const genres = m.genres ? m.genres.split(", ").filter(Boolean) : [];
  const isEnglish = m.language === "en";
  const langLabel = isEnglish ? "EN" : (m.language || "").toUpperCase();
  const filmUrl = letterboxdUrl(m);

  const runtimeStr = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : null;

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ background: "#fff", borderColor: "rgba(11,11,11,0.12)" }}
    >
      <div className="p-3">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: INK.primary }}>
                {m.title}
              </span>
              <a href={filmUrl} target="_blank" rel="noopener noreferrer" title="View on Letterboxd">
                <LetterboxdIcon />
              </a>
            </div>
            <div className="text-[11px]" style={{ color: INK.muted }}>
              {m.year}
              {runtimeStr ? ` · ${runtimeStr}` : ""}
              {m.rated ? ` · ${m.rated}` : ""}
            </div>
          </div>
          {score > 0 && (
            <span className="whitespace-nowrap font-mono text-[10px] font-medium" style={{ color: ACCENT }}>
              {Math.round(score * 100)}% match
            </span>
          )}
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {genres.map((g) => {
            const key = GENRE_KEY_SET.has(g) ? (g as GenreKey) : null;
            return (
              <span
                key={g}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{ background: "rgba(11,11,11,0.05)", color: INK.secondary }}
              >
                {key && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: GENRE_COLORS[key] }}
                  />
                )}
                {g}
              </span>
            );
          })}
          <span
            className="rounded-full border px-1.5 py-0.5 text-[10px]"
            style={{ borderColor: "rgba(11,11,11,0.18)", color: INK.muted }}
          >
            {langLabel}
          </span>
        </div>

        {reasons.length > 0 && (
          <div className="rounded-md p-2" style={{ background: INK.surface }}>
            <div
              className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: ACCENT }}
            >
              Why this film
            </div>
            <div className="flex flex-col gap-1">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className="h-1 w-1 flex-shrink-0 rounded-full"
                    style={{ background: ACCENT }}
                  />
                  <span className="text-[11px]" style={{ color: INK.secondary }}>
                    {r.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
