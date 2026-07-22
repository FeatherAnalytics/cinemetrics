"use client";

import type { ReactNode } from "react";
import { useExplorer } from "@/lib/store";
import { useRecommend } from "@/lib/recommendStore";
import { GENRE_COLORS, GENRE_KEYS, type GenreKey } from "@/lib/palette";
import { RangeSlider } from "./RangeSlider";
import type { TextField } from "@/lib/store";
import { STORIES } from "@/lib/stories";

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

export function FilterBar() {
  const {
    filters,
    toggleGenre,
    setRewatch,
    setCountry,
    reset,
    filtered,
    all,
    yearBounds,
    setYearRange,
    releaseYearBounds,
    setReleaseYearRange,
    titleOptions,
    directorOptions,
    actorOptions,
    countryOptions,
    activeStory,
    setStory,
  } = useExplorer();
  const { dispatch: recDispatch } = useRecommend();
  const [wLo, wHi] = filters.yearRange ?? yearBounds;
  const [rLo, rHi] = filters.releaseYearRange ?? releaseYearBounds;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <FieldGroup label="story">
        <select
          value={activeStory ?? ""}
          onChange={(e) => setStory(e.target.value || null)}
          className="w-full rounded-md border px-2.5 py-1 text-sm outline-none focus:border-[#c01023]"
          style={{
            borderColor: "rgba(11,11,11,0.2)",
            background: "transparent",
            color: activeStory ? "#0b0b0b" : "rgba(11,11,11,0.5)",
          }}
        >
          <option value="">Free explore</option>
          {STORIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup label="discover">
        <button
          onClick={() => recDispatch({ type: "OPEN_RECOMMEND" })}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[#f7f6f3] transition"
          style={{ background: "#7b2cbf" }}
        >
          <span aria-hidden>🎲</span>
          <span>Recommend</span>
        </button>
      </FieldGroup>

      {/* Search */}
      <div className="flex flex-col gap-2">
        <SearchInput field="title" placeholder="movie title…" options={titleOptions} />
        <SearchInput field="director" placeholder="director…" options={directorOptions} />
        <SearchInput field="actor" placeholder="actor…" options={actorOptions} />
        <select
          value={filters.country ?? ""}
          onChange={(e) => setCountry(e.target.value || null)}
          className="w-full rounded-md border px-2.5 py-1 text-sm outline-none focus:border-[#c01023]"
          style={{
            borderColor: "rgba(11,11,11,0.2)",
            background: "transparent",
            color: filters.country ? "#0b0b0b" : "rgba(11,11,11,0.5)",
          }}
        >
          <option value="">country…</option>
          {countryOptions.map((c) => (
            <option key={c.iso} value={c.iso} style={{ color: "#0b0b0b" }}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <FieldGroup label="genre">
        <div className="flex flex-wrap gap-1.5">
          {GENRE_KEYS.map((g) => {
            const active = filters.genres.size === 0 || filters.genres.has(g);
            return (
              <button
                key={g}
                onClick={() => toggleGenre(g as GenreKey)}
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
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8b8981]">{label}</span>
      {children}
    </div>
  );
}
