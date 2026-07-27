"use client";

import { useMemo, useState } from "react";
import { interpolateRgb } from "d3";
import { useExplorer } from "@/lib/store";
import { HEART_COOL, HEART_LIKED, HEART_UNKNOWN, heartColor } from "@/lib/heartLens";
import { GEM_MAX_VOTES, GEM_MIN_RATING, LONG_MIN } from "@/lib/stories";
import { DIVERGE_COOL, DIVERGE_MID, DIVERGE_WARM, INK, primaryGenre } from "@/lib/palette";
import { computeMedianRating } from "@/lib/stats";
import type { EnrichedWatch } from "@/lib/types";

const W = 900;
const H = 130;
const ML = 16;
const MR = 16;
const MB = 22;

const WARM = DIVERGE_WARM;
const COOL = DIVERGE_COOL;
const MID = DIVERGE_MID;
/**
 * The middle state under a story lens.
 *
 * Chrome gray, not the pale `DIVERGE_MID`. The pale tint is designed to be read as
 * a region with an outline around it; on a two-pixel stripe against an off-white
 * page it disappears, which is what made the Double features barcode look like a
 * handful of crimson bars on an empty field.
 */
const NEUTRAL = "#b3b1a6";

type LegendKey = { color: string; label: string };

/** Every encoding the stripes can carry, with the words that name it. */
const LEGENDS: Record<
  "rating" | "binges" | "gems" | "runtime" | "heart" | "spooktober",
  { aria: string; keys: (median: number) => LegendKey[] }
> = {
  rating: {
    aria: "One stripe per rated watch in order, colored by how far the rating sat above or below my median",
    keys: (median) => [
      { color: WARM, label: `above my median (${median})` },
      { color: MID, label: "at par" },
      { color: COOL, label: "below" },
    ],
  },
  binges: {
    aria: "One stripe per rated watch in order, colored by how many films I watched that day",
    keys: () => [
      { color: WARM, label: "three or more films that day" },
      { color: NEUTRAL, label: "a double feature" },
      { color: COOL, label: "a single film" },
    ],
  },
  gems: {
    aria: "One stripe per rated watch in order, marking the watches of films that are hidden gems",
    keys: () => [
      { color: WARM, label: "a hidden gem" },
      { color: NEUTRAL, label: "rated 80+, widely seen" },
      { color: COOL, label: "rated under 80" },
    ],
  },
  runtime: {
    aria: "One stripe per rated watch in order, marking long films and how I rated them",
    keys: (median) => [
      { color: WARM, label: `${LONG_MIN} min or more, rated ${median}+` },
      { color: COOL, label: `${LONG_MIN} min or more, rated under ${median}` },
      { color: NEUTRAL, label: "shorter" },
    ],
  },
  spooktober: {
    aria: "One stripe per rated watch in order, marking the horror I watched in October",
    keys: () => [
      { color: WARM, label: "horror, in October" },
      { color: NEUTRAL, label: "horror, other months" },
      { color: COOL, label: "not horror" },
    ],
  },
  heart: {
    aria: "One stripe per rated watch in order, colored by the Letterboxd heart",
    keys: () => [
      { color: HEART_LIKED, label: "hearted" },
      { color: HEART_COOL, label: "not hearted" },
      { color: HEART_UNKNOWN, label: "no heart recorded" },
    ],
  },
};

const lerpToWarm = interpolateRgb(MID, WARM);
const lerpToCool = interpolateRgb(MID, COOL);

export function StreakStripes() {
  const { all, filtered, selectedId, setSelected, heartLens, activeStory } = useExplorer();

  /**
   * Which encoding the stripes carry.
   *
   * The barcode is the only chart whose x axis is one mark per watch, which makes
   * it the natural place for a story to show a property OF the watches rather than
   * a summary of them. Each lens replaces the warm-cool rating ramp outright: at two
   * pixels a stripe cannot carry a category and a gradient at once.
   */
  const lens: "binges" | "gems" | "runtime" | "heart" | "spooktober" | null = heartLens
    ? "heart"
    : activeStory === "binges"
      ? "binges"
      : activeStory === "hidden-gems"
        ? "gems"
        : activeStory === "runtime"
          ? "runtime"
          : activeStory === "spooktober"
            ? "spooktober"
            : null;

  /**
   * The three story lenses IGNORE the story's own filter, and only here.
   *
   * Each one is a contrast, and the story has already filtered away the half it
   * contrasts against: Double features selects binge days, so no single-film day
   * survives to draw in blue; Hidden gems selects gems, so nothing scores under 80;
   * the runtime story selects long films, so nothing is short. Every other chart in
   * those stories keeps the filter. This one needs the whole log or it is drawing
   * one color and calling it a comparison.
   */
  const source = lens != null && lens !== "heart" ? all : filtered;
  const [hover, setHover] = useState<{ i: number; w: EnrichedWatch } | null>(null);

  const { rated, med, devMax } = useMemo(() => {
    const rated = source
      .filter((w) => w.rating != null)
      .sort((a, b) => a.d.getTime() - b.d.getTime());
    // The median is always taken from the FULL log, not the filtered set, so a
    // stripe keeps its color no matter which filters are active — a filtered
    // view never quietly moves the bar.
    const med = computeMedianRating(all);
    let devMax = 10;
    if (med != null) for (const w of rated) devMax = Math.max(devMax, Math.abs((w.rating as number) - med));
    return { rated, med, devMax };
  }, [all, source]);

  /**
   * How many films each day held, counted over EVERY watch and not just the rated
   * ones the barcode can draw.
   *
   * `computeBinges` counts a day the same way. Counting only rated watches made the
   * two disagree: a day with three films where one was logged without a star read as
   * a double feature on the barcode while the story headline called it a three-film
   * peak, on the exact date the headline names.
   */
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of source) counts.set(w.date, (counts.get(w.date) ?? 0) + 1);
    return counts;
  }, [source]);

  /**
   * Gem status per FILM, by its LATEST rating, matching how the story defines it.
   *
   * The story exists to say a rewatch can grow into a gem, so a film's early
   * lukewarm stripe must not be colored as a non-gem while the story is selecting
   * that same film. Keyed on tmdb_id, never on title.
   */
  const gemFilms = useMemo(() => {
    const latest = new Map<number, EnrichedWatch>();
    for (const w of source) {
      if (w.rating == null) continue;
      const prev = latest.get(w.tmdb_id);
      if (prev == null || w.d > prev.d) latest.set(w.tmdb_id, w);
    }
    const out = new Map<number, "gem" | "low" | "seen">();
    for (const [id, w] of latest) {
      if ((w.rating as number) < GEM_MIN_RATING) out.set(id, "low");
      else out.set(id, (w.film?.imdb_votes ?? 0) < GEM_MAX_VOTES ? "gem" : "seen");
    }
    return out;
  }, [source]);


  if (rated.length === 0 || med == null) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-[#67655f]">
        No rated watches to plot.
      </div>
    );
  }

  const stripeW = (W - ML - MR) / rated.length;

  const yearStarts: { x: number; year: number }[] = [];
  const monthStarts: number[] = [];
  let lastYear = 0;
  let lastMonth = -1;
  rated.forEach((w, i) => {
    const y = w.d.getUTCFullYear();
    const m = w.d.getUTCMonth();
    if (y !== lastYear) {
      yearStarts.push({ x: ML + i * stripeW, year: y });
      lastYear = y;
      lastMonth = m;
    } else if (m !== lastMonth) {
      monthStarts.push(ML + i * stripeW);
      lastMonth = m;
    }
  });

  // The barcode is the ONE chart that recolors rather than dims, and it earns the
  // exception. Its stripes are two pixels wide with no gap, so a faded stripe beside
  // a full one reads as a lighter shade of the same ramp rather than a different
  // kind of watch. Replacing the ramp gives every stripe a flat, unmistakable state
  // and turns the run of hearted films into a solid crimson block, which is the
  // strongest single picture in the story.
  const colorOf = (w: EnrichedWatch) => {
    if (lens === "binges") {
      const n = perDay.get(w.date) ?? 1;
      return n >= 3 ? WARM : n === 2 ? NEUTRAL : COOL;
    }
    if (lens === "gems") {
      const state = gemFilms.get(w.tmdb_id);
      return state === "gem" ? WARM : state === "low" ? COOL : NEUTRAL;
    }
    if (lens === "spooktober") {
      // Genre first, then the month: a non-horror watch is blue whenever it
      // happened, so the crimson reads as the intersection rather than as October.
      if (primaryGenre(w.film) !== "Horror") return COOL;
      // getUTCMonth against a date parsed as UTC midnight, matching how the story
      // itself picks October. Reading it in local time would shift every watch back
      // a day and leak the 1st and 31st into the wrong month.
      return w.d.getUTCMonth() === 9 ? WARM : NEUTRAL;
    }
    if (lens === "runtime") {
      if ((w.film?.runtime ?? 0) < LONG_MIN) return NEUTRAL;
      return (w.rating as number) >= med ? WARM : COOL;
    }
    if (lens === "heart") return heartColor(w);
    const t = Math.max(-1, Math.min(1, ((w.rating as number) - med) / devMax));
    return t < 0 ? lerpToCool(-t) : lerpToWarm(t);
  };

  const hasSel = selectedId != null;

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          LEGENDS[lens ?? "rating"].aria
        }
      >
        {rated.map((w, i) => {
          const sel = hasSel && w.tmdb_id === selectedId;
          return (
            <rect
              key={`${w.tmdb_id}-${w.date}-${i}`}
              x={ML + i * stripeW}
              y={8}
              width={stripeW + 0.3}
              height={H - MB - 8}
              fill={colorOf(w)}
              opacity={hasSel && !sel ? 0.3 : 1}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover({ i, w })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSelected(w.tmdb_id)}
            />
          );
        })}
        {/* Unlabeled month ticks under the block; year starts get the label. */}
        {monthStarts.map((x, i) => (
          <line key={`m-${i}`} x1={x} y1={H - MB} x2={x} y2={H - MB + 3} stroke={INK.grid} strokeWidth={0.75} />
        ))}
        {yearStarts.map(({ x, year }) => (
          <g key={year}>
            <line x1={x} y1={8} x2={x} y2={H - MB + 2} stroke={INK.surface} strokeWidth={1} />
            <line x1={x} y1={H - MB} x2={x} y2={H - MB + 5} stroke={INK.axis} strokeWidth={1} />
            <text x={x + 2} y={H - 6} fill={INK.muted} fontSize={10} textAnchor="start">
              {year}
            </text>
          </g>
        ))}
      </svg>

      {/* The legend names whichever encoding is live. A swatch for a color the chart
          is not drawing is worse than no legend, since it teaches the wrong reading. */}
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: INK.muted }}>
        {LEGENDS[lens ?? "rating"].keys(Math.round(med)).map((k) => (
          <span key={k.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4" style={{ background: k.color }} /> {k.label}
          </span>
        ))}
      </figcaption>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${Math.min(88, Math.max(8, ((ML + hover.i * stripeW) / W) * 100))}%`,
            top: 0,
            transform: "translate(-50%, -110%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <span className="font-medium">{hover.w.film?.title ?? hover.w.tmdb_id}</span>
          <span style={{ color: "#c3c2b7" }}>
            {" "}
            · {hover.w.d.toISOString().slice(0, 10)} · {Math.round(hover.w.rating as number)} (
            {(hover.w.rating as number) >= med ? "+" : ""}
            {Math.round((hover.w.rating as number) - med)} vs median)
          </span>
        </div>
      )}
    </figure>
  );
}
