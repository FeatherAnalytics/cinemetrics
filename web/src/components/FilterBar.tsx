"use client";

import { useState, type ReactNode } from "react";
import { useExplorer } from "@/lib/store";
import { useRecommend } from "@/lib/recommendStore";
import { GENRE_KEYS } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { RangeSlider } from "./RangeSlider";
import type { TextField } from "@/lib/store";

const REWATCH: Array<"all" | "first" | "rewatch"> = ["all", "first", "rewatch"];

function SearchInput({
  field,
  placeholder,
  options,
}: {
  field: TextField;
  placeholder: string;
  options: string[];
}) {
  const { filters, setText } = useExplorer();
  const { tokens } = useTheme();
  const listId = `opts-${field}`;
  return (
    <>
      <input
        value={filters[field]}
        onChange={(e) => setText(field, e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="w-full rounded-md border px-2.5 py-1 text-sm outline-none focus:border-[color:var(--fb-accent)]"
        style={
          {
            borderColor: `color-mix(in srgb, ${tokens.ink.primary} 20%, transparent)`,
            background: "transparent",
            color: tokens.ink.primary,
            "--fb-accent": tokens.accent,
          } as React.CSSProperties
        }
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

// Shared styling for the single-pick dropdown filters.
function SelectFilter({
  value,
  onChange,
  label,
  placeholder,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const { tokens } = useTheme();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={label}
      className="w-full rounded-md border px-2.5 py-1 text-sm outline-none focus:border-[color:var(--fb-accent)]"
      style={
        {
          borderColor: `color-mix(in srgb, ${tokens.ink.primary} 20%, transparent)`,
          background: "transparent",
          color: value ? tokens.ink.primary : tokens.ink.muted,
          "--fb-accent": tokens.accent,
        } as React.CSSProperties
      }
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ color: tokens.ink.primary }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar() {
  const {
    filters,
    toggleGenre,
    setRewatch,
    setCountry,
    setLanguage,
    setRated,
    setFranchise,
    reset,
    filtered,
    all,
    yearBounds,
    setYearRange,
    releaseYearBounds,
    setReleaseYearRange,
    runtimeBounds,
    setRuntimeRange,
    setRatingRange,
    setVotesRange,
    votesBounds,
    titleOptions,
    directorOptions,
    actorOptions,
    countryOptions,
    languageOptions,
    ratedOptions,
    franchiseOptions,
    activeStory,
    setStory,
    watchlist,
    filteredWatchlist,
    watchlistOptions,
  } = useExplorer();
  const { dispatch: recDispatch } = useRecommend();
  const { tokens } = useTheme();

  /**
   * The watchlist story reduces the rail rather than hiding it.
   *
   * A watchlist film has no watch date, no rating and no rewatch state, so those
   * controls are removed instead of left visible and inert — a reader who drags
   * the rating slider and sees nothing move has found a bug, not a filter that
   * does not apply. Content rating and franchise go too, for the duller reason
   * that dim_watchlist does not export them.
   *
   * What is left — genre, release year, runtime, country, language — is measured
   * against the WATCHLIST, since it reaches years and countries the viewing
   * history never does and an option that matches nothing reads as broken.
   */
  const watchlistMode = activeStory === "watchlist";
  const releaseBounds = watchlistMode
    ? watchlistOptions.releaseYearBounds
    : releaseYearBounds;
  const runBounds = watchlistMode ? watchlistOptions.runtimeBounds : runtimeBounds;
  const countries = watchlistMode ? watchlistOptions.countryOptions : countryOptions;
  const languages = watchlistMode ? watchlistOptions.languageOptions : languageOptions;

  const [wLo, wHi] = filters.yearRange ?? yearBounds;
  const [rLo, rHi] = filters.releaseYearRange ?? releaseBounds;
  const [mLo, mHi] = filters.runtimeRange ?? runBounds;
  const [sLo, sHi] = filters.ratingRange ?? [0, 100];

  /**
   * Vote counts slide in LOG space.
   *
   * They run from ~100 to 2.8 million, so a linear track puts every film below
   * 100k inside its first 4% — the whole interesting range, compressed into a
   * few pixels. The slider therefore moves over 0-100 percent of the log range
   * and converts at the edges; the filter itself still stores real counts, so
   * nothing downstream has to know.
   */
  const [vMinLog, vMaxLog] = [Math.log10(votesBounds[0]), Math.log10(votesBounds[1])];
  const toPct = (v: number) =>
    Math.round(((Math.log10(Math.max(v, 1)) - vMinLog) / (vMaxLog - vMinLog)) * 100);
  const fromPct = (p: number) => Math.round(10 ** (vMinLog + (p / 100) * (vMaxLog - vMinLog)));
  const [vLo, vHi] = filters.votesRange ?? votesBounds;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {activeStory && (
        <div
          className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
          style={{
            borderColor: tokens.accent,
            background: `color-mix(in srgb, ${tokens.accent} 6%, transparent)`,
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: tokens.accent }}>
            story active
          </span>
          <button
            onClick={() => setStory(null)}
            className="text-xs underline underline-offset-2"
            style={{ color: tokens.accent }}
          >
            clear
          </button>
        </div>
      )}

      <FieldGroup label="discover">
        <button
          onClick={() => recDispatch({ type: "OPEN_RECOMMEND" })}
          className="flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 transition hover:bg-[color:var(--fb-hover)]"
          style={
            {
              borderColor: `color-mix(in srgb, ${tokens.ink.primary} 20%, transparent)`,
              color: tokens.ink.secondary,
              "--fb-hover": `color-mix(in srgb, ${tokens.ink.primary} 4%, transparent)`,
            } as React.CSSProperties
          }
        >
          <span aria-hidden>🎲</span>
          <span>Recommend films</span>
        </button>
      </FieldGroup>

      <FieldGroup
        label="film details"
        collapsible
        defaultOpen={false}
        active={Boolean(
          filters.title || filters.director || filters.actor || filters.country ||
          filters.language || filters.rated || filters.franchise,
        )}
      >
      <div className="flex flex-col gap-2">
        {!watchlistMode && (
          <>
            <SearchInput field="title" placeholder="movie title…" options={titleOptions} />
            <SearchInput field="director" placeholder="director…" options={directorOptions} />
            <SearchInput field="actor" placeholder="actor…" options={actorOptions} />
          </>
        )}
        <SelectFilter
          value={filters.country}
          onChange={setCountry}
          label="Production country"
          placeholder="country…"
          options={countries.map((c) => ({ value: c.iso, label: c.name }))}
        />
        <SelectFilter
          value={filters.language}
          onChange={setLanguage}
          label="Original language"
          placeholder="language…"
          options={languages.map((l) => ({ value: l.code, label: l.name }))}
        />
        {!watchlistMode && (
          <>
            <SelectFilter
              value={filters.rated}
              onChange={setRated}
              label="Content rating"
              placeholder="content rating…"
              options={ratedOptions.map((r) => ({ value: r, label: r }))}
            />
            <SelectFilter
              value={filters.franchise}
              onChange={setFranchise}
              label="Franchise"
              placeholder="franchise…"
              options={franchiseOptions.map((f) => ({
                value: f,
                label: f.replace(/ Collection$/, ""),
              }))}
            />
          </>
        )}
      </div>
      </FieldGroup>

      <FieldGroup label="genre">
        <div className="flex flex-wrap gap-1.5">
          {GENRE_KEYS.map((g) => {
            const active = filters.genres.size === 0 || filters.genres.has(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition"
                style={{
                  borderColor: `color-mix(in srgb, ${tokens.ink.primary} 18%, transparent)`,
                  color: tokens.ink.secondary,
                  opacity: active ? 1 : 0.4,
                }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: tokens.genre[g] }}
                />
                {g}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      {!watchlistMode && (
      <FieldGroup label="watches">
        <div
          className="flex w-fit overflow-hidden rounded-full border"
          style={{ borderColor: `color-mix(in srgb, ${tokens.ink.primary} 18%, transparent)` }}
        >
          {REWATCH.map((r) => (
            <button
              key={r}
              onClick={() => setRewatch(r)}
              className="px-3 py-1 capitalize transition"
              style={{
                background: filters.rewatch === r ? tokens.ui.active : "transparent",
                color: filters.rewatch === r ? tokens.ui.activeText : tokens.ink.secondary,
              }}
            >
              {r === "first" ? "first watch" : r}
            </button>
          ))}
        </div>
      </FieldGroup>
      )}

      <FieldGroup
        label="ranges"
        collapsible
        defaultOpen={false}
        active={
          (!watchlistMode && filters.yearRange !== null) ||
          filters.releaseYearRange !== null ||
          filters.runtimeRange !== null ||
          filters.votesRange !== null ||
          (!watchlistMode && filters.ratingRange !== null)
        }
      >
        <div className="flex flex-col gap-2.5">
          {!watchlistMode && (
            <SliderRow label="watched" display={`${wLo}–${wHi}`}>
              <RangeSlider min={yearBounds[0]} max={yearBounds[1]} value={[wLo, wHi]} onChange={setYearRange} />
            </SliderRow>
          )}
          <SliderRow label="released" display={`${rLo}–${rHi}`}>
            <RangeSlider
              min={releaseBounds[0]}
              max={releaseBounds[1]}
              value={[rLo, rHi]}
              onChange={setReleaseYearRange}
            />
          </SliderRow>
          <SliderRow label="runtime" display={`${mLo}–${mHi}m`}>
            <RangeSlider
              min={runBounds[0]}
              max={runBounds[1]}
              step={5}
              unit="minutes"
              value={[mLo, mHi]}
              onChange={setRuntimeRange}
            />
          </SliderRow>
          {!watchlistMode && (
            <SliderRow label="my rating" display={`${sLo}–${sHi}`}>
              <RangeSlider
                min={0}
                max={100}
                step={5}
                unit="rating"
                value={[sLo, sHi]}
                onChange={setRatingRange}
              />
            </SliderRow>
          )}
          <SliderRow label="imdb votes" display={`${fmtVotes(vLo)}–${fmtVotes(vHi)}`}>
            <RangeSlider
              min={0}
              max={100}
              step={1}
              unit="percent of vote range"
              value={[toPct(vLo), toPct(vHi)]}
              onChange={([a, b]) =>
                setVotesRange([
                  // Snap the ends back to the true bounds so dragging fully open
                  // clears the filter instead of leaving it a hair inside.
                  a <= 0 ? votesBounds[0] : fromPct(a),
                  b >= 100 ? votesBounds[1] : fromPct(b),
                ])
              }
            />
          </SliderRow>
        </div>
      </FieldGroup>

      <div
        className="flex items-center justify-between border-t pt-3"
        style={{
          borderColor: `color-mix(in srgb, ${tokens.ink.primary} 12%, transparent)`,
          color: tokens.ink.muted,
        }}
      >
        {/* The count names what the charts above it are actually plotting. In
            watchlist mode that is films, not watches — reporting watches there
            would be a denominator from a different dataset entirely. */}
        <span className="font-mono text-xs">
          {watchlistMode
            ? `${filteredWatchlist.length} / ${watchlist.length} films`
            : `${filtered.length} / ${all.length} watches`}
        </span>
        <button
          onClick={reset}
          className="underline underline-offset-2 hover:text-[color:var(--fb-hover-ink)]"
          style={{ "--fb-hover-ink": tokens.ink.primary } as React.CSSProperties}
        >
          reset
        </button>
      </div>
    </div>
  );
}

// Vote counts are read as magnitudes, not exact figures, and "2811614" in a
// 150px rail is noise. Two significant figures is the most anyone acts on.
function fmtVotes(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

// One labeled slider inside the "ranges" group.
function SliderRow({
  label,
  display,
  children,
}: {
  label: string;
  display: string;
  children: ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: tokens.ink.muted }}
      >
        {label}
      </span>
      <div className="flex items-center gap-3">
        {children}
        <span className="font-mono text-xs" style={{ color: tokens.ink.secondary }}>
          {display}
        </span>
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  children,
  collapsible = false,
  defaultOpen = true,
  active = false,
}: {
  label: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  active?: boolean; // shows a dot on a collapsed header when its filter is set
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { tokens } = useTheme();
  const header = (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color: tokens.ink.muted }}
    >
      {label}
    </span>
  );
  if (!collapsible) {
    return (
      <div className="flex flex-col gap-1.5">
        {header}
        {children}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-left"
      >
        <span aria-hidden className="text-[9px]" style={{ color: tokens.ink.muted }}>
          {open ? "▾" : "▸"}
        </span>
        {header}
        {!open && active && (
          // Ink, not the accent. A small crimson dot here would sit in the same
          // panel as the genre chips' small crimson dot, where crimson means
          // Horror — two dots the same size and colour meaning different things.
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: tokens.ui.active }}
            aria-label="filter active"
          />
        )}
      </button>
      {open && children}
    </div>
  );
}
