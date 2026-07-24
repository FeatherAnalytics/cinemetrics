"use client";

import type { ReactNode } from "react";
import { useExplorer } from "@/lib/store";
import { useRecommend } from "@/lib/recommendStore";
import { ACCENT, GENRE_COLORS, GENRE_KEYS } from "@/lib/palette";
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
  const listId = `opts-${field}`;
  return (
    <>
      <input
        value={filters[field]}
        onChange={(e) => setText(field, e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="w-full rounded-md border px-2.5 py-1 text-sm text-[#0b0b0b] outline-none focus:border-[#c01023]"
        style={{ borderColor: "rgba(11,11,11,0.2)", background: "transparent" }}
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
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={label}
      className="w-full rounded-md border px-2.5 py-1 text-sm outline-none focus:border-[#c01023]"
      style={{
        borderColor: "rgba(11,11,11,0.2)",
        background: "transparent",
        color: value ? "#0b0b0b" : "#67655f",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ color: "#0b0b0b" }}>
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
    titleOptions,
    directorOptions,
    actorOptions,
    countryOptions,
    languageOptions,
    ratedOptions,
    franchiseOptions,
    activeStory,
    setStory,
  } = useExplorer();
  const { dispatch: recDispatch } = useRecommend();
  const [wLo, wHi] = filters.yearRange ?? yearBounds;
  const [rLo, rHi] = filters.releaseYearRange ?? releaseYearBounds;
  const [mLo, mHi] = filters.runtimeRange ?? runtimeBounds;
  const [sLo, sHi] = filters.ratingRange ?? [0, 100];

  return (
    <div className="flex flex-col gap-4 text-sm">
      {activeStory && (
        <div
          className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
          style={{ borderColor: ACCENT, background: "rgba(192,16,35,0.06)" }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: ACCENT }}>
            story active
          </span>
          <button
            onClick={() => setStory(null)}
            className="text-xs underline underline-offset-2"
            style={{ color: ACCENT }}
          >
            clear
          </button>
        </div>
      )}

      <FieldGroup label="discover">
        <button
          onClick={() => recDispatch({ type: "OPEN_RECOMMEND" })}
          className="flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 transition hover:bg-[rgba(11,11,11,0.04)]"
          style={{ borderColor: "rgba(11,11,11,0.2)", color: "#3d3c38" }}
        >
          <span aria-hidden>🎲</span>
          <span>Recommend films</span>
        </button>
      </FieldGroup>

      {/* Search */}
      <div className="flex flex-col gap-2">
        <SearchInput field="title" placeholder="movie title…" options={titleOptions} />
        <SearchInput field="director" placeholder="director…" options={directorOptions} />
        <SearchInput field="actor" placeholder="actor…" options={actorOptions} />
        <SelectFilter
          value={filters.country}
          onChange={setCountry}
          label="Production country"
          placeholder="country…"
          options={countryOptions.map((c) => ({ value: c.iso, label: c.name }))}
        />
        <SelectFilter
          value={filters.language}
          onChange={setLanguage}
          label="Original language"
          placeholder="language…"
          options={languageOptions.map((l) => ({ value: l.code, label: l.name }))}
        />
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
      </div>

      <FieldGroup label="genre">
        <div className="flex flex-wrap gap-1.5">
          {GENRE_KEYS.map((g) => {
            const active = filters.genres.size === 0 || filters.genres.has(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[#3d3c38] transition"
                style={{ borderColor: "rgba(11,11,11,0.18)", opacity: active ? 1 : 0.4 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: GENRE_COLORS[g] }}
                />
                {g}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup label="watches">
        <div
          className="flex w-fit overflow-hidden rounded-full border"
          style={{ borderColor: "rgba(11,11,11,0.18)" }}
        >
          {REWATCH.map((r) => (
            <button
              key={r}
              onClick={() => setRewatch(r)}
              className="px-3 py-1 capitalize transition"
              style={{
                background: filters.rewatch === r ? "#c01023" : "transparent",
                color: filters.rewatch === r ? "#f7f6f3" : "#3d3c38",
              }}
            >
              {r === "first" ? "first watch" : r}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="watched">
        <div className="flex items-center gap-3">
          <RangeSlider min={yearBounds[0]} max={yearBounds[1]} value={[wLo, wHi]} onChange={setYearRange} />
          <span className="font-mono text-xs text-[#3d3c38]">
            {wLo}–{wHi}
          </span>
        </div>
      </FieldGroup>

      <FieldGroup label="released">
        <div className="flex items-center gap-3">
          <RangeSlider
            min={releaseYearBounds[0]}
            max={releaseYearBounds[1]}
            value={[rLo, rHi]}
            onChange={setReleaseYearRange}
          />
          <span className="font-mono text-xs text-[#3d3c38]">
            {rLo}–{rHi}
          </span>
        </div>
      </FieldGroup>

      <FieldGroup label="runtime">
        <div className="flex items-center gap-3">
          <RangeSlider
            min={runtimeBounds[0]}
            max={runtimeBounds[1]}
            step={5}
            unit="minutes"
            value={[mLo, mHi]}
            onChange={setRuntimeRange}
          />
          <span className="font-mono text-xs text-[#3d3c38]">
            {mLo}–{mHi}m
          </span>
        </div>
      </FieldGroup>

      <FieldGroup label="my rating">
        <div className="flex items-center gap-3">
          <RangeSlider
            min={0}
            max={100}
            step={5}
            unit="rating"
            value={[sLo, sHi]}
            onChange={setRatingRange}
          />
          <span className="font-mono text-xs text-[#3d3c38]">
            {sLo}–{sHi}
          </span>
        </div>
      </FieldGroup>

      <div
        className="flex items-center justify-between border-t pt-3 text-[#67655f]"
        style={{ borderColor: "rgba(11,11,11,0.12)" }}
      >
        <span className="font-mono text-xs">
          {filtered.length} / {all.length} watches
        </span>
        <button onClick={reset} className="underline underline-offset-2 hover:text-[#0b0b0b]">
          reset
        </button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#67655f]">{label}</span>
      {children}
    </div>
  );
}
