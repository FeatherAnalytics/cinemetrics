"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";
import { ACCENT, GENRE_COLORS, INK, primaryGenre, type GenreKey } from "@/lib/palette";
import { countryName } from "@/lib/countries";
import { watchKey } from "@/lib/brush";

type Row = {
  key: string;
  tmdb_id: number;
  date: string; // YYYY-MM-DD watched date
  t: number; // sort key
  title: string;
  year: number | null;
  genre: GenreKey;
  me: number | null; // this viewing's rating
  mc: number | null; // Metacritic
  rt: number | null; // Rotten Tomatoes
  imdb: number | null; // IMDB (0-100)
};

// Letterboxd resolves films by TMDB id and redirects to the canonical page.
const letterboxdUrl = (tmdbId: number) => `https://letterboxd.com/tmdb/${tmdbId}/`;

// Shown while a brush selection OR a map country pick is active. Both are just
// cross-filters, so `filtered` already IS the selection; we summarise it and
// list every watch in date order.
export function SelectionPanel() {
  const { filtered, filters, setSelection, setCountry } = useExplorer();

  const { rows, films, avgMe, avgCritic, genres } = useMemo(() => {
    const rows: Row[] = filtered.map((w) => ({
      key: watchKey(w),
      tmdb_id: w.tmdb_id,
      date: w.date,
      t: w.d.getTime(),
      title: w.film?.title ?? String(w.tmdb_id),
      year: w.film?.year ?? null,
      genre: primaryGenre(w.film),
      me: w.rating,
      mc: w.film?.metascore ?? null,
      rt: w.film?.rt_rating ?? null,
      imdb: w.film?.imdb_rating ?? null,
    }));
    rows.sort((a, b) => a.t - b.t || a.title.localeCompare(b.title)); // oldest → most recent

    // Distinct films for the summary (a rewatched film counts once).
    const seen = new Map<number, { genre: GenreKey; mc: number | null }>();
    for (const w of filtered)
      if (!seen.has(w.tmdb_id))
        seen.set(w.tmdb_id, { genre: primaryGenre(w.film), mc: w.film?.metascore ?? null });

    const meVals = filtered.map((w) => w.rating).filter((v): v is number => v != null);
    const avgMe = meVals.length ? meVals.reduce((s, v) => s + v, 0) / meVals.length : null;
    const criticVals = [...seen.values()].map((f) => f.mc).filter((v): v is number => v != null);
    const avgCritic = criticVals.length
      ? criticVals.reduce((s, v) => s + v, 0) / criticVals.length
      : null;

    const gCounts = new Map<GenreKey, number>();
    for (const f of seen.values()) gCounts.set(f.genre, (gCounts.get(f.genre) ?? 0) + 1);
    const genres = [...gCounts.entries()].sort((a, b) => b[1] - a[1]);

    return { rows, films: seen.size, avgMe, avgCritic, genres };
  }, [filtered]);

  if (!filters.selection && !filters.country) return null;

  const delta = avgMe != null && avgCritic != null ? avgMe - avgCritic : null;
  const clear = () => {
    setSelection(null);
    setCountry(null);
  };

  return (
    <section
      className="rounded-lg border p-4"
      style={{ borderColor: ACCENT, background: "rgba(192,16,35,0.03)" }}
      aria-label="Current selection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h2 className="font-display text-lg font-semibold text-[#0b0b0b]">
            {filters.country ? countryName(filters.country) : "Selection"}{" "}
            <span style={{ color: ACCENT }}>·</span> {films} {films === 1 ? "film" : "films"}
          </h2>
          <span className="font-mono text-xs" style={{ color: INK.muted }}>
            {rows.length} watches
          </span>
          {avgMe != null && (
            <span className="text-xs" style={{ color: INK.secondary }}>
              avg me <b>{avgMe % 1 === 0 ? Math.round(avgMe) : avgMe.toFixed(1)}</b>
              {avgCritic != null && (
                <>
                  {" "}
                  · avg critic <b>{avgCritic % 1 === 0 ? Math.round(avgCritic) : avgCritic.toFixed(1)}</b>
                  {delta != null && (
                    <>
                      {" "}
                      · I rate {delta >= 0 ? "+" : ""}
                      {delta % 1 === 0 ? Math.round(delta) : delta.toFixed(1)}
                    </>
                  )}
                </>
              )}
            </span>
          )}
        </div>
        <button
          onClick={clear}
          className="rounded-full border px-3 py-1 text-xs text-[#3d3c38] transition hover:text-[#0b0b0b]"
          style={{ borderColor: "rgba(11,11,11,0.2)" }}
        >
          clear selection
        </button>
      </div>

      {genres.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: INK.muted }}>
          {genres.map(([g, n]) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: GENRE_COLORS[g] }} />
              {g} {n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 max-h-72 overflow-y-auto rounded border" style={{ borderColor: "rgba(11,11,11,0.1)" }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0" style={{ background: "#f2f1ec" }}>
            <tr style={{ color: INK.muted }}>
              <th className="px-3 py-1.5 text-left font-medium">Watched</th>
              <th className="px-3 py-1.5 text-left font-medium">Title</th>
              <th className="px-2 py-1.5 text-right font-medium">Year</th>
              <th className="px-2 py-1.5 text-right font-medium">Me</th>
              <th className="px-2 py-1.5 text-right font-medium">MC</th>
              <th className="px-2 py-1.5 text-right font-medium">RT</th>
              <th className="px-2 py-1.5 text-right font-medium">IMDB</th>
              <th className="px-3 py-1.5 text-left font-medium">Genre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.key}#${i}`} className="border-t" style={{ borderColor: "rgba(11,11,11,0.06)" }}>
                <td className="px-3 py-1.5 font-mono text-xs tabular-nums" style={{ color: INK.secondary }}>
                  {r.date}
                </td>
                <td className="px-3 py-1.5">
                  <a
                    href={letterboxdUrl(r.tmdb_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0b0b0b] underline decoration-transparent underline-offset-2 transition hover:decoration-[#c01023]"
                    title="View on Letterboxd"
                  >
                    {r.title}
                  </a>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: INK.secondary }}>
                  {r.year ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#0b0b0b]">
                  {r.me != null ? Math.round(r.me) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: INK.secondary }}>
                  {r.mc ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: INK.secondary }}>
                  {r.rt ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: INK.secondary }}>
                  {r.imdb ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5" style={{ color: INK.secondary }}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: GENRE_COLORS[r.genre] }} />
                    {r.genre}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
