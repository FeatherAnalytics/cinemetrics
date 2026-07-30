"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { primaryGenre, type GenreKey } from "@/lib/palette";
import { hairline, useTheme } from "@/lib/theme";
import { countryName } from "@/lib/countries";
import { watchKey } from "@/lib/brush";
import { fmt1 } from "@/lib/format";

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

type SortKey = "date" | "title" | "year" | "me" | "mc" | "rt" | "imdb" | "genre";
type Sort = { key: SortKey; dir: 1 | -1 };

type Column = { key: SortKey; label: string; numeric: boolean };

const COLUMNS: Column[] = [
  { key: "date", label: "Watched", numeric: false },
  { key: "title", label: "Title", numeric: false },
  { key: "year", label: "Year", numeric: true },
  { key: "me", label: "Me", numeric: true },
  { key: "mc", label: "MC", numeric: true },
  { key: "rt", label: "RT", numeric: true },
  { key: "imdb", label: "IMDB", numeric: true },
  { key: "genre", label: "Genre", numeric: false },
];

/**
 * The watchlist view of the same table.
 *
 * The date column becomes the RELEASE date, because a watchlist film has no
 * watched date — that is the whole point of the list. "Me" goes entirely rather
 * than printing a column of dashes: nothing on the list has been rated, so the
 * column could never hold a value and an empty column reads as missing data
 * rather than as a category that does not apply.
 */
const WATCHLIST_COLUMNS: Column[] = [
  { key: "date", label: "Released", numeric: false },
  { key: "title", label: "Title", numeric: false },
  { key: "year", label: "Year", numeric: true },
  { key: "mc", label: "MC", numeric: true },
  { key: "rt", label: "RT", numeric: true },
  { key: "imdb", label: "IMDB", numeric: true },
  { key: "genre", label: "Genre", numeric: false },
];

function compareRows(a: Row, b: Row, sort: Sort): number {
  const { key, dir } = sort;
  if (key === "date") return dir * (a.t - b.t || a.title.localeCompare(b.title));
  if (key === "title" || key === "genre") return dir * a[key].localeCompare(b[key]);
  // Numeric columns: missing values always sink to the bottom, whatever the
  // direction, so the interesting rows stay on top.
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return a.t - b.t;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir * (av - bv) || a.t - b.t;
}

// Shown while a brush selection OR a map country pick is active. Both are just
// cross-filters, so `filtered` already IS the selection; we summarise it and
// list every watch in date order.
export function SelectionPanel() {
  const {
    filtered,
    filters,
    setSelection,
    setCountry,
    activeStory,
    filteredWatchlist,
    selectedId,
    setSelected,
  } = useExplorer();
  const { tokens } = useTheme();
  const [sort, setSort] = useState<Sort>({ key: "date", dir: 1 }); // oldest → most recent
  const watchlistMode = activeStory === "watchlist";
  /**
   * The favourites story is the other one whose subject is a SET rather than a
   * selection: every film carrying the heart. It sets no brush, so without this
   * the panel never appeared for it at all.
   */
  const heartMode = activeStory === "heart";
  const columns = watchlistMode ? WATCHLIST_COLUMNS : COLUMNS;
  const [openByHand, setOpenByHand] = useState(false);

  /**
   * In watchlist mode the table is a drawer, not a result.
   *
   * The whole list is 136 rows, and dropping that above the charts every time
   * the story opens buries them. So it starts closed and the reader opens it —
   * except when a filter is running, where the table IS the answer to what they
   * just clicked and hiding it would make the click feel like it did nothing.
   *
   * `openByHand` survives the filter clearing, so a reader who opened the table
   * and then cleared a country does not have it shut on them.
   */
  const watchlistFiltered =
    filters.genres.size > 0 ||
    filters.releaseYearRange !== null ||
    filters.runtimeRange !== null ||
    filters.votesRange !== null ||
    filters.country !== null ||
    filters.language !== null ||
    filters.genreTag !== null ||
    filters.keyword !== null;
  const open = !watchlistMode || openByHand || watchlistFiltered || selectedId != null;

  const { rows, films, avgMe, avgCritic, genres } = useMemo(() => {
    if (watchlistMode) {
      // A clicked film narrows the table to itself, which is what the release
      // year chart's click is for; clearing the pick restores the list.
      const source =
        selectedId != null
          ? filteredWatchlist.filter((f) => f.tmdb_id === selectedId)
          : filteredWatchlist;
      // `t` sorts on the release date, falling back to January 1 of the year for
      // the few films TMDB has no date for — the same fallback the barcode uses,
      // so the two orderings agree.
      const wlRows: Row[] = source.map((f) => ({
        key: `wl-${f.tmdb_id}`,
        tmdb_id: f.tmdb_id,
        date: f.released ?? (f.year != null ? `${f.year}` : "—"),
        t: f.released
          ? new Date(f.released + "T00:00:00Z").getTime()
          : f.year != null
            ? Date.UTC(f.year, 0, 1)
            : 0,
        title: f.title,
        year: f.year,
        genre: primaryGenre(f),
        me: null,
        mc: null,
        rt: null,
        imdb: f.imdb_rating ?? null,
      }));
      wlRows.sort((a, b) => compareRows(a, b, sort));
      const gCounts = new Map<GenreKey, number>();
      for (const r of wlRows) gCounts.set(r.genre, (gCounts.get(r.genre) ?? 0) + 1);
      return {
        rows: wlRows,
        films: wlRows.length,
        avgMe: null,
        avgCritic: null,
        genres: [...gCounts.entries()].sort((a, b) => b[1] - a[1]),
      };
    }

    // The heart story lists FILMS, one row each, so a film watched four times
    // does not fill four rows of a table about which films are loved. The most
    // recent watch supplies the rating, matching how the gems story picks one.
    const source = heartMode
      ? [...new Map(filtered.filter((w) => w.heart === true).map((w) => [w.tmdb_id, w])).values()]
      : filtered;

    const rows: Row[] = source.map((w) => ({
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
    rows.sort((a, b) => compareRows(a, b, sort));

    // Distinct films for the summary (a rewatched film counts once).
    const seen = new Map<number, { genre: GenreKey; mc: number | null }>();
    for (const w of source)
      if (!seen.has(w.tmdb_id))
        seen.set(w.tmdb_id, { genre: primaryGenre(w.film), mc: w.film?.metascore ?? null });

    const meVals = source.map((w) => w.rating).filter((v): v is number => v != null);
    const avgMe = meVals.length ? meVals.reduce((s, v) => s + v, 0) / meVals.length : null;
    const criticVals = [...seen.values()].map((f) => f.mc).filter((v): v is number => v != null);
    const avgCritic = criticVals.length
      ? criticVals.reduce((s, v) => s + v, 0) / criticVals.length
      : null;

    const gCounts = new Map<GenreKey, number>();
    for (const f of seen.values()) gCounts.set(f.genre, (gCounts.get(f.genre) ?? 0) + 1);
    const genres = [...gCounts.entries()].sort((a, b) => b[1] - a[1]);

    return { rows, films: seen.size, avgMe, avgCritic, genres };
  }, [filtered, filteredWatchlist, watchlistMode, heartMode, selectedId, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  // The watchlist story shows the table unconditionally: the list IS the subject
  // there, not a selection made out of something larger.
  if (!watchlistMode && !heartMode && !filters.selection && !filters.country) return null;

  const delta = avgMe != null && avgCritic != null ? avgMe - avgCritic : null;
  const clear = () => {
    setSelection(null);
    setCountry(null);
  };

  return (
    <section
      className="min-w-0 rounded-lg border p-4"
      style={{
        borderColor: tokens.accent,
        background: hairline(tokens.accent, 3),
      }}
      aria-label="Current selection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h2 className="font-display text-lg font-semibold" style={{ color: tokens.ink.primary }}>
            {watchlistMode
              ? selectedId != null
                ? "Film"
                : "Watchlist"
              : heartMode
                ? "Favourites"
                : filters.country
                ? countryName(filters.country)
                : "Selection"}{" "}
            <span style={{ color: tokens.accent }}>·</span> {films} {films === 1 ? "film" : "films"}
          </h2>
          {!watchlistMode && !heartMode && (
            <span className="font-mono text-xs" style={{ color: tokens.ink.muted }}>
              {rows.length} watches
            </span>
          )}
          {avgMe != null && (
            <span className="text-xs" style={{ color: tokens.ink.secondary }}>
              avg me <b>{fmt1(avgMe)}</b>
              {avgCritic != null && (
                <>
                  {" "}
                  · avg critic <b>{fmt1(avgCritic)}</b>
                  {delta != null && (
                    <>
                      {" "}
                      · I rate {delta >= 0 ? "+" : ""}
                      {fmt1(delta)}
                    </>
                  )}
                </>
              )}
            </span>
          )}
        </div>
        {watchlistMode && selectedId != null ? (
          <button
            onClick={() => setSelected(null)}
            className="rounded-full border px-3 py-1 text-xs transition hover:text-[color:var(--foreground)]"
            style={{ borderColor: hairline(tokens.ink.primary, 20), color: tokens.ink.secondary }}
          >
            back to all films
          </button>
        ) : watchlistMode ? (
          <button
            onClick={() => setOpenByHand((v) => !v)}
            aria-expanded={open}
            className="rounded-full border px-3 py-1 text-xs transition hover:text-[color:var(--foreground)]"
            style={{ borderColor: hairline(tokens.ink.primary, 20), color: tokens.ink.secondary }}
          >
            {open ? "hide films" : "show films"}
          </button>
        ) : heartMode ? null : (
          <button
            onClick={clear}
            className="rounded-full border px-3 py-1 text-xs transition hover:text-[color:var(--foreground)]"
            style={{ borderColor: hairline(tokens.ink.primary, 20), color: tokens.ink.secondary }}
          >
            clear selection
          </button>
        )}
      </div>

      {open && genres.length > 0 && (
        <div
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"
          style={{ color: tokens.ink.muted }}
        >
          {genres.map(([g, n]) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: tokens.genre[g] }} />
              {g} {n}
            </span>
          ))}
        </div>
      )}

      {open && (
      <div
        className="mt-3 max-h-72 overflow-x-auto overflow-y-auto rounded border"
        style={{ borderColor: hairline(tokens.ink.primary, 10) }}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0" style={{ background: tokens.surface.well }}>
            <tr style={{ color: tokens.ink.muted }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                  }
                  className={`py-1.5 font-medium ${c.numeric ? "px-2 text-right" : "px-3 text-left"}`}
                >
                  <button
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 font-medium hover:text-[color:var(--foreground)]"
                    title={`Sort by ${c.label}`}
                  >
                    {c.label}
                    <span aria-hidden className="text-[9px]">
                      {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-t"
                style={{ borderColor: hairline(tokens.ink.primary, 6) }}
              >
                <td className="px-3 py-1.5 font-mono text-xs tabular-nums" style={{ color: tokens.ink.secondary }}>
                  {r.date}
                </td>
                <td className="px-3 py-1.5">
                  <a
                    href={letterboxdUrl(r.tmdb_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-transparent underline-offset-2 transition hover:decoration-[color:var(--sp-accent)]"
                    style={
                      {
                        color: tokens.ink.primary,
                        "--sp-accent": tokens.accent,
                      } as React.CSSProperties
                    }
                    title="View on Letterboxd"
                  >
                    {r.title}
                  </a>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: tokens.ink.secondary }}>
                  {r.year ?? "—"}
                </td>
                {!watchlistMode && (
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: tokens.ink.primary }}>
                    {r.me != null ? Math.round(r.me) : "—"}
                  </td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: tokens.ink.secondary }}>
                  {r.mc ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: tokens.ink.secondary }}>
                  {r.rt ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: tokens.ink.secondary }}>
                  {r.imdb ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5" style={{ color: tokens.ink.secondary }}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: tokens.genre[r.genre] }} />
                    {r.genre}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
