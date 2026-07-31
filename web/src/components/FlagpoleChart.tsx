"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { likedOnly } from "@/lib/heartLens";
import { hairline, useTheme } from "@/lib/theme";
import { starLabel, STAR_BINS } from "@/lib/likedChart";
import { useWidth } from "@/lib/useWidth";
import {
  filmMeanInView,
  releaseYearStarsInView,
  THIN_N,
  type YearStars,
} from "@/lib/yearQuality";
import { accentFor, isPicked, pickWatches } from "./stats/pick";

const W0 = 720;
const W_MIN = 300;

/**
 * Half-star rows sit `(H - MT - MB) / 10` apart, so the height sets the gap
 * between flags. At 193 that is 15.7px against an 11px flag — a 4.7px gap, half
 * the air the chart carried at 240, with the flags themselves unchanged.
 */
const H = 193;
/** Wide enough for the mean line's label alongside the star ticks. */
const ML = 68;
const MR = 12;
const MB = 26;
const MT = 10;
/**
 * Flag thickness, centred on its star line.
 *
 * Half-star rows sit about 20px apart at this height, so 11 leaves a 9px gap: the
 * flags read as a solid mark you can compare rather than a hairline, and two
 * adjacent half stars still separate. Thicker and 3.5★ would touch 4★, which
 * would merge the two bins the whole library turns on.
 */
const FLAG = 11;
/** How far the whole-star ticks reach left of the axis, into the gutter. */
const TICK = 5;
/** Closest two year labels may sit before the later one is dropped. */
const LABEL_GAP = 30;
/** Reference lengths in the key. Ends at the chart's own longest flag. */
const KEY_STOPS = [1, 5];
/**
 * Ceiling on the longest flag, in pixels.
 *
 * Flags are sized from the column, and the column is the plot divided by the
 * years in view — which the rail can drive to one. Selecting a single year gave
 * that year the entire plot width, so every flag ran the full width of the card
 * and the key's swatches pushed the PAGE into a horizontal scroll. A cap costs
 * nothing at full scale, where thirty-one years leave 26px a column, and stops
 * the degenerate end from being a layout bug.
 */
const MAX_FLAG = 80;

/**
 * Flag length for `count` films, as a fraction of the longest flag on the chart.
 *
 * LOG, not linear. Linear is the truthful encoding and it did not survive contact
 * with this data: 2019 puts thirty-two films on one half star while most years put
 * one or two on theirs, so a linear scale that fits 2019 in a column renders every
 * single-film flag at two thirds of a pixel. Log spends the length on the
 * distinction the chart is actually for — which half stars a year used at all, and
 * which one it leaned on — and gives up the ability to read "four times as many"
 * off two flag lengths. The hover gives the exact count, and the key gives the
 * scale, so nothing is only available by measuring.
 *
 * `log1p` rather than `log` because a one-film flag has to have length: log(1) is
 * zero, which would draw the most common count in the chart as nothing at all.
 *
 * ROUNDED TO TWO DECIMALS, and that is not cosmetic. `Math.log1p` is only
 * specified as an approximation, so Node and V8 disagree in the last bit: the
 * static export shipped `width="5.888767655737537"` and the browser rehydrated
 * `5.888767655737539`, which React reports as a hydration mismatch on every flag
 * in the chart.
 */
function flagLength(count: number, max: number, full: number): number {
  return Math.round((Math.log1p(count) / Math.log1p(max)) * full * 100) / 100;
}

/**
 * Which columns get a year label: every fifth year, minus any that would collide.
 *
 * The axis is categorical, so these label the years PRESENT and are not marks on a
 * timeline — 1980 and 1995 are adjacent columns and their labels overlapped, which
 * is exactly the misreading a reader makes if they are left to. Hover names the
 * year exactly, so a dropped label costs nothing.
 */
function labelledColumns(years: YearStars[], px: (i: number) => number): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < years.length; i++) {
    // Every fifth year is the right grain for a full axis and the wrong one under
    // a filter: narrowed to a handful of years, none may be divisible by five and
    // the axis loses every label it had. Below the point where they can collide,
    // label them all.
    if (years.length > 8 && years[i].year % 5 !== 0) continue;
    const x = px(i);
    if (x - last < LABEL_GAP) continue;
    out.push(i);
    last = x;
  }
  return out;
}

/**
 * Every release year's rating distribution as a flagpole: a pole standing on the
 * year, and a flag flying right at each half star, as long as the films rated
 * there.
 *
 * The box plots above reduce a genre to five numbers, which is what makes them
 * comparable and also what makes them lie by omission. This is the same kind of
 * data with nothing collapsed, cut by release year rather than genre.
 *
 * FLAGS FLY ONE WAY. Grown from both sides of the pole this read as a violin plot,
 * where the shape is symmetric because it is drawn twice and the width at any
 * height is really half the count. One-sided, the length of a flag IS the number
 * of films.
 *
 * NO GRIDLINES. Thirty-odd poles are structure enough, and a horizontal rule
 * behind them fought the flags for the same pixels. What fixes the scale instead
 * is the smallest thing that can: a baseline under the poles, a five-pixel tick
 * beside each whole star, and the dashed mean.
 *
 * ONLY YEARS WITH `THIN_N` FILMS OR MORE, which is what lets the chart fit the
 * column with no horizontal scroll — the flags share one length scale, so the
 * longest flag anywhere decides what one film is worth everywhere. What it costs
 * is a true time axis: the surviving years are set side by side, so a slope across
 * this chart is an artefact. UNDER A NARROW FILTER that floor can leave nothing
 * standing, and the chart says so rather than drawing an axis with no marks on it.
 *
 * ONE ROW PER FILM at its most recent rating IN VIEW, so a rewatched film cannot
 * outvote four films released the same year.
 */
export function FlagpoleChart() {
  const { filtered, filters, setSelection, activeStory, heartLens } = useExplorer();
  const { tokens } = useTheme();
  const [ref, W] = useWidth(W0, W_MIN);
  // Two levels: which year the pointer is over, and which of its flags, if any.
  const [hover, setHover] = useState<{ year: number; bin: number | null } | null>(null);

  /**
   * The film floor applies on the landing page and NOT inside a story.
   *
   * On the landing page it is doing real work: every release year is in view, and
   * the years holding one or two films are noise drawn at the same weight as the
   * years holding thirty. A story has already answered that — it has narrowed the
   * watches to the ones it is about, so a year with two films in view is two of
   * the films the story selected, and dropping it hides part of the story's own
   * evidence. Spooktober keeps 8 of its years under the floor and 24 without it.
   */
  const floor = activeStory ? 1 : THIN_N;
  // Under the heart lens the chart is about the films that got the heart, so the
  // mean line moves with them too: a hearted-only distribution measured against
  // the whole library's average would put every flag above the line and say
  // nothing, since hearting tracks the rating.
  const lensed = useMemo(
    () => (heartLens ? likedOnly(filtered) : filtered),
    [heartLens, filtered],
  );
  const years = useMemo(() => releaseYearStarsInView(lensed, floor), [lensed, floor]);
  const mean = useMemo(() => filmMeanInView(lensed), [lensed]);
  const accent = accentFor(filters.genres, tokens);
  const activeYear = years.find((b) => isPicked(b.watches, filters.selection))?.year ?? null;

  if (!years.length) {
    return (
      <p className="text-sm" style={{ color: tokens.ink.muted }}>
        {floor > 1 ? `No release year in view has ${floor} rated films.` : "Nothing in view is rated."}
      </p>
    );
  }

  const maxCount = Math.max(...years.map((b) => Math.max(...b.counts)), 1);
  const colW = (W - ML - MR) / years.length;
  // The 3px held back is the gap before the next pole, so the longest flag never
  // runs into the year in front of it. Capped, so a single year in view does not
  // make one film a plot-wide bar. See MAX_FLAG.
  const flagW = Math.min(colW - 3, MAX_FLAG);

  const y = (stars: number) => H - MB - (stars / 5) * (H - MB - MT);
  // Poles sit at the LEFT edge of their column, since flags need the whole width
  // to the right of the pole they fly from.
  const px = (i: number) => ML + i * colW;

  const shownIndex = hover ? years.findIndex((b) => b.year === hover.year) : -1;
  const shown = shownIndex >= 0 ? years[shownIndex] : null;
  const shownBin = hover?.bin ?? null;
  // The key ends at the chart's own longest flag, so a reference above it is not
  // on the scale being keyed: filtered down to a two-film peak it printed "1, 5, 2"
  // and offered a swatch longer than anything drawn.
  const stops = [...new Set([...KEY_STOPS.filter((c) => c < maxCount), maxCount])];

  return (
    <div ref={ref}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span
          className="font-mono text-[10px] tracking-wider uppercase"
          style={{ color: tokens.ink.muted }}
        >
          {shown && shownBin != null ? (
            // A flag under the pointer: that bin alone, as a count and as its share
            // of the year. The share is the part the flag cannot give — lengths are
            // log-scaled, and a year's own size is not on the chart at all.
            <>
              <span style={{ color: tokens.ink.primary }}>{shown.year}</span>{" "}
              {starLabel(STAR_BINS[shownBin])} ·{" "}
              <span style={{ color: tokens.ink.primary }}>
                {shown.counts[shownBin]} film{shown.counts[shownBin] === 1 ? "" : "s"}
              </span>{" "}
              ({Math.round((shown.counts[shownBin] / shown.n) * 100)}%)
            </>
          ) : shown ? (
            <>
              <span style={{ color: tokens.ink.primary }}>{shown.year}</span> · {shown.n} films
              · most at{" "}
              <span style={{ color: tokens.ink.primary }}>
                {starLabel(STAR_BINS[shown.counts.indexOf(Math.max(...shown.counts))])}
              </span>
            </>
          ) : (
            // States the floor in force, since it is not the same one in a story.
            floor > 1 ? `years with ${floor}+ films` : `${years.length} years in view`
          )}
        </span>

        {/* The key, and the only reason a log length encoding is allowed here. It
            draws the real scale at three counts rather than describing it, so a
            reader can lay a flag against it instead of taking the word "log" on
            trust. */}
        <span
          className="flex items-center gap-3 font-mono text-[10px] tracking-wider uppercase"
          style={{ color: tokens.ink.muted }}
        >
          <span>films, log</span>
          {stops.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <svg width={Math.max(flagLength(c, maxCount, flagW), 1)} height={FLAG} aria-hidden>
                <rect width="100%" height={FLAG} fill={tokens.ink.mark} />
              </svg>
              {c}
            </span>
          ))}
        </span>
      </div>

      <svg
        width={W}
        height={H}
        role="img"
        style={{ maxWidth: "100%" }}
        aria-label={`Rating distribution for each release year holding at least ${THIN_N} films, ${
          years[0].year
        } to ${
          years[years.length - 1].year
        }. Each year is a vertical pole with a bar flying right at every half star, its length the log of the number of films rated there.`}
      >
        {STAR_BINS.filter((s) => Number.isInteger(s)).map((s) => (
          <g key={`t-${s}`}>
            <line x1={ML - TICK} y1={y(s)} x2={ML} y2={y(s)} stroke={tokens.ink.axis} />
            {/* The tick label yields to the mean's, which shares the gutter. */}
            {(mean == null || Math.abs(y(s) - y(mean)) > 9) && (
              <text
                x={ML - TICK - 4}
                y={y(s) + 3}
                textAnchor="end"
                fontSize={9}
                fill={tokens.ink.muted}
              >
                {starLabel(s)}
              </text>
            )}
          </g>
        ))}

        {/* My average film in view, so a flag's height reads against the library
            and not only against the other years. Drawn before the poles so it
            never cuts across a flag. */}
        {mean != null && (
          <>
            <line
              x1={ML}
              y1={y(mean)}
              x2={W - MR}
              y2={y(mean)}
              stroke={tokens.ink.muted}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={ML - TICK - 4}
              y={y(mean) + 3}
              textAnchor="end"
              fontSize={8}
              fill={tokens.ink.muted}
            >
              mean {mean.toFixed(2)}★
            </text>
          </>
        )}

        {/* The ground the poles stand on. The one rule left on the chart. */}
        <line
          x1={ML - TICK}
          y1={y(0)}
          x2={W - MR}
          y2={y(0)}
          stroke={tokens.ink.axis}
          strokeWidth={1}
        />

        {years.map((b, i) => {
          const sel = activeYear === b.year;
          const on = sel || hover?.year === b.year;
          const dim = activeYear != null && !sel;
          const pick = () => pickWatches(b.watches, filters.selection, setSelection);
          return (
            <g key={b.year} opacity={dim ? 0.35 : 1}>
              {/* The column hit area is drawn FIRST so the flags sit on top of it
                  and can report which bin the pointer is on. Painted after them it
                  would swallow every flag's own hover. */}
              <rect
                x={px(i)}
                y={0}
                width={colW}
                height={H - MB}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ year: b.year, bin: null })}
                onMouseLeave={() => setHover(null)}
                onClick={pick}
              />
              <line
                x1={px(i)}
                y1={y(0)}
                x2={px(i)}
                y2={y(5)}
                stroke={on ? tokens.ink.axis : hairline(tokens.ink.grid, 55)}
                strokeWidth={1}
              />
              {b.counts.map((c, bin) =>
                c > 0 ? (
                  <rect
                    key={bin}
                    x={px(i)}
                    y={y(STAR_BINS[bin]) - FLAG / 2}
                    width={Math.max(flagLength(c, maxCount, flagW), 1)}
                    height={FLAG}
                    // Genre identity, from the theme's own scale so it lifts in
                    // dark mode. A bin with no plurality stays on the neutral
                    // mark: inventing a winner for a two-and-two split would name
                    // a category the films do not agree on. State rides OPACITY
                    // rather than colour, so hovering a Horror flag cannot repaint
                    // it as something else.
                    fill={b.dominant[bin] ? tokens.genre[b.dominant[bin]] : tokens.ink.mark}
                    fillOpacity={on ? 1 : 0.72}
                    style={{ cursor: "pointer" }}
                    // Leaving a flag falls back to the year rather than to nothing:
                    // the pointer is still inside the column, and blanking the
                    // readout there would flicker on every crossing.
                    onMouseEnter={() => setHover({ year: b.year, bin })}
                    onMouseLeave={() => setHover({ year: b.year, bin: null })}
                    onClick={pick}
                  />
                ) : null,
              )}
            </g>
          );
        })}

        {labelledColumns(years, px).map((i) => (
          <text
            key={`lbl-${years[i].year}`}
            x={px(i)}
            y={H - MB + 14}
            textAnchor="middle"
            fontSize={9}
            fill={activeYear === years[i].year ? accent : tokens.ink.muted}
            fontWeight={activeYear === years[i].year ? 700 : 400}
            pointerEvents="none"
          >
            {years[i].year}
          </text>
        ))}
      </svg>
    </div>
  );
}
