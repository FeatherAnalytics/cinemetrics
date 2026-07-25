"use client";

/**
 * Chart prototypes for go/no-go review. Route: /lab
 *
 * Deliberately plain: no interaction, no responsive work, no story copy. Each
 * one exists to answer "is this worth building properly?" and nothing more.
 * Promote the yeses into web/src/components/, delete this directory after.
 *
 * Live here: 5 (watches per day), 5b (viewing velocity, PARTIAL), 5c (cumulative
 * stacked, APPROVED for stats), 10 (genre pairing, APPROVED for stats),
 * 11 (ratings by genre, APPROVED for stats).
 *
 * Promoted to the main page already: 3 (me vs critics, rebinned to half-stars),
 * 4 (stat panel subtexts), 8 (what travels well).
 *
 * Dropped: 9 (deviation by acclaim, no signal), 10b (bubble variant).
 */

import { useMemo } from "react";
import { GENRE_COLORS, GENRE_KEYS, primaryGenre, type GenreKey } from "@/lib/palette";
import type { Dataset, EnrichedWatch, Film } from "@/lib/types";

const W = 720;
const INK = "#0b0b0b";
const MUTED = "#67655f";
const ACCENT = "#c01023"; // the site accent crimson
// The companion tone to the accent. A chrome grey rather than a genre colour, so
// it never reads as a category.
const FADE = "#b3b1a6";

// DIVERGE_MID from the palette: a neutral tint of the paper surface, chosen there
// precisely because it recedes. Used for pairs backed by a single film, which
// cannot support a rating claim.
const MID = "#eceae3";

// Genres below this many rated films are dropped from the heatmaps and box plot.
const MIN_FILMS_PER_GENRE = 10;

// Below this many films a pair's mean rating is one film's opinion. Those cells
// still render, but in MID, and they are kept OUT of the colour and font domains:
// 20 of 94 pairs are singletons and their ratings span 50 to 80, which was
// stretching the ramp so every ordinary pair landed mid-scale.
const MIN_FILMS_PER_PAIR = 2;

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Crimson at the top of the range, fading to chrome grey at the bottom. */
function densityColor(share: number): string {
  return lerpHex(ACCENT, FADE, 1 - Math.max(0, Math.min(1, share)));
}

const BASE_FONT = 9;

/* ------------------------------------------------------------------ shared */

function Panel({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14 border-t border-[#ddd] pt-5">
      <h2 className="text-base font-bold" style={{ color: INK }}>
        <span style={{ color: ACCENT }}>#{n}</span> {title}
      </h2>
      <p className="mb-3 max-w-[68ch] text-[13px] leading-snug" style={{ color: MUTED }}>
        {note}
      </p>
      {children}
    </section>
  );
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Daily watch counts across the full date span, zero-filled. */
function dailyCounts(watches: EnrichedWatch[]): number[] {
  if (!watches.length) return [];
  const byDay = new Map<string, number>();
  for (const w of watches) byDay.set(w.date, (byDay.get(w.date) ?? 0) + 1);

  const dates = [...byDay.keys()].sort();
  const days: number[] = [];
  const end = new Date(dates[dates.length - 1]);
  for (let d = new Date(dates[0]); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return days;
}

/* ----------------------------------------- 5: watches per day, smoothed   */

function WatchesPerDay({ watches, window: win }: { watches: EnrichedWatch[]; window: number }) {
  const H = 90;

  const series = useMemo(() => {
    const days = dailyCounts(watches);
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < days.length; i++) {
      sum += days[i];
      if (i >= win) sum -= days[i - win];
      out.push(sum / Math.min(i + 1, win));
    }
    return out;
  }, [watches, win]);

  if (!series.length) return null;

  const peak = Math.max(...series, 0.001);
  const step = W / series.length;

  return (
    <div className="mb-3">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
        {win}-day rolling mean
      </div>
      <svg width={W} height={H} role="img">
        {series.map((v, i) => (
          <rect
            key={i}
            x={i * step}
            y={H - (v / peak) * H}
            width={Math.max(step, 0.7)}
            height={(v / peak) * H}
            fill={ACCENT}
            opacity={0.75}
          />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------- 5c: cumulative views          */

/**
 * Total watches accumulated over time, stacked by the film's primary genre.
 *
 * Where the rolling charts show RATE (and so are noisy), this shows TOTAL: the
 * slope carries the rate, and the band thicknesses carry composition. A binge
 * appears as a steepening, and a genre's share of the whole is readable at any
 * point along the x-axis.
 *
 * Genre is just the demo breakdown. Any categorical field could stack the same
 * way: decade, country, rating band, liked/not.
 */
function CumulativeByGenre({ watches }: { watches: EnrichedWatch[] }) {
  const H = 240;
  const ML = 40;
  const MB = 24;

  const model = useMemo(() => {
    const dated = watches.filter((w) => w.date).sort((a, b) => a.date.localeCompare(b.date));
    if (!dated.length) return null;

    // Monthly buckets keep the path small without visibly stepping.
    const monthOf = (d: string) => d.slice(0, 7);
    const months: string[] = [];
    const start = new Date(dated[0].date.slice(0, 7) + "-01T00:00:00Z");
    const last = new Date(dated[dated.length - 1].date.slice(0, 7) + "-01T00:00:00Z");
    for (let d = new Date(start); d <= last; d.setUTCMonth(d.getUTCMonth() + 1)) {
      months.push(d.toISOString().slice(0, 7));
    }
    const idx = new Map(months.map((m, i) => [m, i]));

    // running[genre][monthIndex] = cumulative count at the end of that month
    const running = new Map<GenreKey, number[]>(
      GENRE_KEYS.map((g) => [g, Array(months.length).fill(0)]),
    );
    for (const w of dated) {
      const i = idx.get(monthOf(w.date));
      if (i == null) continue;
      running.get(primaryGenre(w.film))![i] += 1;
    }
    for (const arr of running.values()) {
      for (let i = 1; i < arr.length; i++) arr[i] += arr[i - 1];
    }

    const total = GENRE_KEYS.reduce((s, g) => s + running.get(g)![months.length - 1], 0);
    return { months, running, total };
  }, [watches]);

  if (!model) return null;

  const { months, running, total } = model;
  const x = (i: number) => ML + (i / Math.max(months.length - 1, 1)) * (W - ML - 12);
  const y = (v: number) => H - MB - (v / Math.max(total, 1)) * (H - MB - 12);

  // Build each band as a closed polygon between its lower and upper edges.
  const bands: { genre: GenreKey; points: string; end: number }[] = [];
  const floor = Array(months.length).fill(0) as number[];
  for (const genre of GENRE_KEYS) {
    const series = running.get(genre)!;
    if (series[series.length - 1] === 0) continue;
    const upper = series.map((v, i) => floor[i] + v);
    const points = [
      ...upper.map((v, i) => `${x(i)},${y(v)}`),
      ...floor.map((v, i) => `${x(months.length - 1 - i)},${y(floor[months.length - 1 - i])}`),
    ].join(" ");
    bands.push({ genre, points, end: series[series.length - 1] });
    for (let i = 0; i < floor.length; i++) floor[i] = upper[i];
  }

  const years = months.filter((m) => m.endsWith("-01"));

  return (
    <div>
      <svg width={W} height={H} role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={ML} y1={y(total * f)} x2={W - 12} y2={y(total * f)} stroke="#eee" />
            <text x={ML - 6} y={y(total * f) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
              {Math.round(total * f)}
            </text>
          </g>
        ))}
        {bands.map((b) => (
          <polygon key={b.genre} points={b.points} fill={GENRE_COLORS[b.genre]} opacity={0.85}>
            <title>{`${b.genre}: ${b.end} watches`}</title>
          </polygon>
        ))}
        {years.map((m) => (
          <text
            key={m}
            x={x(months.indexOf(m))}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill={MUTED}
          >
            {m.slice(0, 4)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 font-mono text-[10px]" style={{ color: MUTED }}>
        {bands
          .slice()
          .sort((a, b) => b.end - a.end)
          .map((b) => (
            <span key={b.genre} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2"
                style={{ background: GENRE_COLORS[b.genre] }}
              />
              {b.genre.toLowerCase()} {b.end}
            </span>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------- 5b: viewing velocity          */

/**
 * Viewing velocity as "one film every N days", the reciprocal of the rate.
 *
 * Reads more naturally than a fractional rate: "one every 3 days" lands where
 * "0.33 films/day" does not. The axis is INVERTED so faster viewing points up,
 * matching the intuition that a busy stretch should look like a peak.
 *
 * Gaps longer than the window produce no value rather than a misleadingly large
 * one, so a drought reads as absence.
 */
function ViewingVelocity({
  watches,
  window: win,
  label,
  tint,
}: {
  watches: EnrichedWatch[];
  window: number;
  label: string;
  tint: string;
}) {
  const H = 110;
  const MB = 16;
  const CAP = 30; // days-per-film beyond this is "barely watching"

  const series = useMemo(() => {
    const days = dailyCounts(watches);
    const out: (number | null)[] = [];
    let sum = 0;
    for (let i = 0; i < days.length; i++) {
      sum += days[i];
      if (i >= win) sum -= days[i - win];
      const span = Math.min(i + 1, win);
      out.push(sum > 0 ? span / sum : null);
    }
    return out;
  }, [watches, win]);

  if (!series.length) {
    return (
      <div className="mb-4 text-[12px]" style={{ color: MUTED }}>
        {label}: no watches
      </div>
    );
  }

  const step = W / series.length;
  const heightFor = (v: number) => (1 - Math.min(v, CAP) / CAP) * (H - MB);

  const known = series.filter((v): v is number => v != null);
  const best = Math.min(...known);
  const median = [...known].sort((a, b) => a - b)[Math.floor(known.length / 2)];

  return (
    <div className="mb-4">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
        {label} · typically 1 film every {median.toFixed(1)} days · best run 1 every{" "}
        {best.toFixed(1)}
      </div>
      <svg width={W} height={H} role="img">
        {[1, 3, 7, 14].map((d) => (
          <g key={d}>
            <line x1={0} y1={heightFor(d)} x2={W} y2={heightFor(d)} stroke="#eee" />
            <text x={2} y={heightFor(d) - 2} fontSize={8} fill={MUTED}>
              1 / {d}d
            </text>
          </g>
        ))}
        {series.map((v, i) =>
          v == null ? null : (
            <rect
              key={i}
              x={i * step}
              y={H - MB - heightFor(v)}
              width={Math.max(step, 0.7)}
              height={heightFor(v)}
              fill={tint}
              opacity={0.8}
            />
          ),
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------- 10: genre pair heatmap */

type Pair = { n: number; rating: number };

/** Shared scales, built only from pairs with enough films to mean anything. */
function pairScales(pairs: Map<string, Pair>) {
  const solid = [...pairs.values()].filter((v) => v.n >= MIN_FILMS_PER_PAIR);
  const ratings = solid.map((v) => v.rating);
  const lo = ratings.length ? Math.min(...ratings) : 0;
  const hi = ratings.length ? Math.max(...ratings) : 1;
  const maxN = Math.max(...[...pairs.values()].map((v) => v.n), 1);

  const share = (rating: number) =>
    hi > lo ? Math.max(0, Math.min(1, (rating - lo) / (hi - lo))) : 1;
  return {
    maxN,
    share,
    // 10% larger than the base at the floor, 100% larger at the top. Applied to
    // every cell including singletons: they are held out of the DOMAIN so they
    // cannot stretch the scale, but they are still sized on it, so no label sits
    // at an odd size next to its neighbours. Their low confidence is carried by
    // the pale cell and muted text instead.
    fontFor: (v: Pair) => BASE_FONT * (1.1 + 0.9 * share(v.rating)),
  };
}

function GenreHeatmap({ genres, pairs }: { genres: string[]; pairs: Map<string, Pair> }) {
  const cell = 34;
  const pad = 96;
  const size = pad + genres.length * cell + 10;
  const { maxN, fontFor } = pairScales(pairs);

  return (
    <svg width={size} height={size} role="img">
      {genres.map((g, i) => (
        <text key={`c${g}`} x={pad + i * cell + cell / 2} y={pad - 6} fontSize={9} fill={MUTED}
          textAnchor="start" transform={`rotate(-55 ${pad + i * cell + cell / 2} ${pad - 6})`}>
          {g}
        </text>
      ))}
      {genres.map((g, r) => (
        <text key={`r${g}`} x={pad - 6} y={pad + r * cell + cell / 2 + 3} fontSize={9}
          fill={MUTED} textAnchor="end">
          {g}
        </text>
      ))}
      {genres.map((a, r) =>
        genres.map((b, c) => {
          if (c < r) return null;
          const v = pairs.get(`${a}|${b}`);
          if (!v) return null;
          const thin = v.n < MIN_FILMS_PER_PAIR;
          return (
            <g key={`${a}-${b}`}>
              <rect
                x={pad + c * cell}
                y={pad + r * cell}
                width={cell - 2}
                height={cell - 2}
                fill={thin ? MID : densityColor(v.n / maxN)}
              />
              <text
                x={pad + c * cell + cell / 2 - 1}
                y={pad + r * cell + cell / 2 + 4}
                textAnchor="middle"
                fontSize={fontFor(v)}
                fontWeight={700}
                fill={thin ? MUTED : v.n / maxN > 0.55 ? "#fff" : INK}
              >
                {Math.round(v.rating)}
              </text>
              <title>{`${a} + ${b}: ${v.n} film${v.n === 1 ? "" : "s"}, mean ${Math.round(v.rating)}`}</title>
            </g>
          );
        }),
      )}
    </svg>
  );
}

/* --------------------------------------------- 11: ratings by genre, box  */

function GenreBoxes({
  rows,
}: {
  rows: { genre: string; n: number; q1: number; med: number; q3: number; lo: number; hi: number }[];
}) {
  const H = 320;
  const MT = 16;
  const MB = 74; // rotated genre labels + n
  const ML = 34;
  const colW = (W - ML - 12) / rows.length;
  const boxW = Math.min(colW - 10, 30);
  const y = (v: number) => MT + (1 - v / 100) * (H - MT - MB);

  return (
    <svg width={W} height={H} role="img">
      {[0, 20, 40, 60, 80, 100].map((t) => (
        <g key={t}>
          <line x1={ML} y1={y(t)} x2={W - 12} y2={y(t)} stroke="#eee" />
          <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
            {t / 20}★
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cx = ML + (i + 0.5) * colW;
        return (
          <g key={r.genre}>
            {/* Whiskers run the full 5th to 95th range but the box is drawn over
                them with an opaque fill, so only the tails outside the IQR show. */}
            <line x1={cx} y1={y(r.hi)} x2={cx} y2={y(r.lo)} stroke={FADE} />
            <line x1={cx - 5} y1={y(r.hi)} x2={cx + 5} y2={y(r.hi)} stroke={FADE} />
            <line x1={cx - 5} y1={y(r.lo)} x2={cx + 5} y2={y(r.lo)} stroke={FADE} />
            <rect
              x={cx - boxW / 2}
              y={y(r.q3)}
              width={boxW}
              height={Math.max(y(r.q1) - y(r.q3), 1)}
              fill={FADE}
            />
            <line
              x1={cx - boxW / 2}
              y1={y(r.med)}
              x2={cx + boxW / 2}
              y2={y(r.med)}
              stroke={ACCENT}
              strokeWidth={2}
            />
            <text
              x={cx}
              y={H - MB + 14}
              textAnchor="end"
              fontSize={10}
              fill={INK}
              transform={`rotate(-45 ${cx} ${H - MB + 14})`}
            >
              {r.genre}
            </text>
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={8} fill={MUTED}>
              {r.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------- app */

export function LabCharts({ data }: { data: Dataset }) {
  const model = useMemo(() => {
    const byId = new Map<number, Film>(data.films.map((f) => [f.tmdb_id, f]));
    const watches: EnrichedWatch[] = data.watches.map((w) => ({
      ...w,
      film: byId.get(w.tmdb_id),
      d: new Date(w.date),
      yearFrac: 0,
    }));

    // Velocity split by a few high-volume genres, to show the per-filter version.
    const velocityGenres = ["Horror", "Comedy", "Drama"]
      .map((genre) => ({
        genre,
        watches: watches.filter((w) => w.film?.genres?.includes(genre)),
      }))
      .filter((g) => g.watches.length >= 20);

    // One rating per FILM, not per watch, so a rewatched film counts once.
    const filmRating = new Map<number, number[]>();
    for (const w of watches) {
      if (w.rating == null) continue;
      (filmRating.get(w.tmdb_id) ?? filmRating.set(w.tmdb_id, []).get(w.tmdb_id)!).push(w.rating);
    }

    const genreCount = new Map<string, number>();
    for (const [id] of filmRating) {
      for (const g of byId.get(id)?.genres ?? []) {
        genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
      }
    }
    const genreList = [...genreCount.entries()]
      .filter(([, n]) => n >= MIN_FILMS_PER_GENRE)
      .map(([g]) => g)
      .sort((a, b) => a.localeCompare(b));
    const genres = new Set(genreList);

    const perGenre = new Map<string, number[]>();
    const pairs = new Map<string, Pair>();
    let multiGenre = 0;

    for (const [id, rs] of filmRating) {
      const r = mean(rs);
      const gs = (byId.get(id)?.genres ?? []).filter((g) => genres.has(g));
      if ((byId.get(id)?.genres ?? []).length > 1) multiGenre += 1;

      for (const g of gs) {
        (perGenre.get(g) ?? perGenre.set(g, []).get(g)!).push(r);
      }
      // Genuine pairs only: j starts past i, so a genre never pairs with itself.
      // A self-pair would just restate the single-genre count and dominate.
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          const a = genreList.indexOf(gs[i]) <= genreList.indexOf(gs[j]) ? gs[i] : gs[j];
          const b = a === gs[i] ? gs[j] : gs[i];
          const key = `${a}|${b}`;
          const e = pairs.get(key) ?? { n: 0, rating: 0 };
          pairs.set(key, { n: e.n + 1, rating: (e.rating * e.n + r) / (e.n + 1) });
        }
      }
    }

    const boxes = [...perGenre.entries()]
      .map(([genre, rs]) => {
        const s = [...rs].sort((a, b) => a - b);
        return {
          genre,
          n: s.length,
          lo: quantile(s, 0.05),
          q1: quantile(s, 0.25),
          med: quantile(s, 0.5),
          q3: quantile(s, 0.75),
          hi: quantile(s, 0.95),
        };
      })
      .sort((a, b) => a.genre.localeCompare(b.genre));

    const singletons = [...pairs.values()].filter((v) => v.n < MIN_FILMS_PER_PAIR).length;

    return {
      watches,
      velocityGenres,
      boxes,
      genres: genreList,
      pairs,
      multiGenre,
      singletons,
      ratedFilms: filmRating.size,
    };
  }, [data]);

  return (
    <main className="mx-auto max-w-[820px] px-6 py-10">
      <h1 className="mb-1 text-xl font-bold" style={{ color: INK }}>
        Chart lab
      </h1>
      <p className="mb-8 text-[13px]" style={{ color: MUTED }}>
        Prototypes for go/no-go. Unstyled, unlinked, disposable. {model.watches.length} watches,{" "}
        {model.ratedFilms} rated films.
      </p>

      <Panel
        n="5"
        title="Watches per day"
        note="10-day trailing mean. Raw daily counts are almost all 0 or 1, so unsmoothed this is noise."
      >
        <WatchesPerDay watches={model.watches} window={10} />
      </Panel>

      <Panel
        n="5c"
        title="Cumulative watches, stacked by genre"
        note="Where the rolling charts show rate and are therefore noisy, this shows total: the slope carries the rate, the band thickness carries composition. A binge reads as a steepening. Genre is only the demo breakdown; decade, country, rating band or liked/not would stack identically."
      >
        <CumulativeByGenre watches={model.watches} />
      </Panel>

      <Panel
        n="5b"
        title="Viewing velocity: one film every N days"
        note="PARTIAL, needs refinement. The reciprocal of the rate, which reads more naturally than a fraction. The axis is inverted so faster viewing points upward. Splitting by genre is the real point: the same window filtered three ways shows whether a busy stretch is a horror binge or broad appetite. Any filter could drive this, genre is just the demo."
      >
        <ViewingVelocity watches={model.watches} window={30} label="all films" tint={ACCENT} />
        {model.velocityGenres.map(({ genre, watches }) => (
          <ViewingVelocity
            key={genre}
            watches={watches}
            window={30}
            label={genre.toLowerCase()}
            tint={FADE}
          />
        ))}
      </Panel>

      <Panel
        n="10"
        title="Genre pairing heatmap"
        note={`${model.multiGenre} of ${model.ratedFilms} rated films carry more than one genre. Self-pairs are excluded, so every cell is a genuine combination. ${model.singletons} pairs are backed by a single film: those render in pale grey and are held OUT of the colour and font scales, since one film cannot support a rating claim and their spread was flattening the ramp for everything else. Numbers are bold and sized by mean rating.`}
      >
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
          shade = film count · number = mean rating (size scales with it)
        </div>
        <div className="overflow-x-auto">
          <GenreHeatmap genres={model.genres} pairs={model.pairs} />
        </div>
      </Panel>

      <Panel
        n="11"
        title="Ratings by genre"
        note={`Crimson line is the median. Box is the interquartile range, whiskers the 5th to 95th percentiles, drawn behind the box so only the tails show. Alphabetical, one value per film rather than per watch. Genres with ${MIN_FILMS_PER_GENRE}+ rated films; the number under each is n.`}
      >
        <GenreBoxes rows={model.boxes} />
      </Panel>
    </main>
  );
}
