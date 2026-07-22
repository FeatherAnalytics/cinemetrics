"use client";

import type { CandidateMetadata } from "@/lib/recommend";
import type { Reason } from "@/lib/explainClient";

type Props = {
  metadata: CandidateMetadata;
  score: number;
  reasons: Reason[];
};

function LetterboxdIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" style={{ opacity: 0.6 }}>
      <circle cx="250" cy="250" r="240" fill="none" stroke="#00e054" strokeWidth="28" />
      <circle cx="175" cy="250" r="80" fill="#ff8000" opacity="0.8" />
      <circle cx="325" cy="250" r="80" fill="#00e054" opacity="0.8" />
      <ellipse cx="250" cy="250" rx="30" ry="75" fill="#fff" opacity="0.6" />
    </svg>
  );
}

function letterboxdSlug(title: string, year: number | null): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return year ? `${base}-${year}` : base;
}

export function FilmCard({ metadata, score, reasons }: Props) {
  const m = metadata;
  const genres = m.genres ? m.genres.split(", ").filter(Boolean) : [];
  const isEnglish = m.language === "en";
  const langLabel = isEnglish ? "EN" : (m.language || "").toUpperCase();
  const slug = letterboxdSlug(m.title, m.year);

  const runtimeStr = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : null;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: "#2a2a4a", borderColor: "#3a3a5a" }}
    >
      <div className="p-3">
        <div className="flex justify-between items-start mb-1.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white">{m.title}</span>
              <a
                href={`https://letterboxd.com/film/${slug}/`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Letterboxd"
              >
                <LetterboxdIcon />
              </a>
            </div>
            <div className="text-[11px]" style={{ color: "#888" }}>
              {m.year}{runtimeStr ? ` · ${runtimeStr}` : ""}{m.rated ? ` · ${m.rated}` : ""}
            </div>
          </div>
          {score > 0 && (
            <div className="text-right">
              <span
                className="text-[11px] font-medium"
                style={{ color: "#a5b4fc" }}
              >
                {Math.round(score * 100)}% match
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-wrap mb-2">
          {genres.map((g) => (
            <span
              key={g}
              className="px-1.5 py-0.5 rounded-full text-[9px]"
              style={{ background: "#3a3a5a", color: "#a5b4fc" }}
            >
              {g}
            </span>
          ))}
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] border"
            style={{
              background: isEnglish ? "#2a3a2a" : "#2a2a3a",
              color: isEnglish ? "#86efac" : "#fbbf24",
              borderColor: isEnglish ? "#2d6b45" : "#92400e",
            }}
          >
            {langLabel}
          </span>
        </div>

        {reasons.length > 0 && (
          <div className="rounded-md p-2" style={{ background: "#1a1a2e" }}>
            <div
              className="text-[8px] uppercase tracking-widest font-semibold mb-1"
              style={{ color: "#c084fc" }}
            >
              Why this film
            </div>
            <div className="flex flex-col gap-1">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: "#c084fc" }}
                  />
                  <span className="text-[10px] text-gray-300">{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
