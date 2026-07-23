// ARCHIVED 2026-07: removed from the page in favour of CountryBars (see
// docs/FRONTEND-REDESIGN.md, Phase 1). Kept for a possible future 3D-globe
// treatment of the same data. Depends on public/data/countries.geojson, which
// is also kept. Not imported anywhere; safe to delete if the globe idea dies.
"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3";
import type { FeatureCollection, Feature } from "geojson";
import { useExplorer, filterWatches } from "@/lib/store";
import { ACCENT, GENRE_COLORS, GENRE_ORDER, INK, primaryGenre, type GenreKey } from "@/lib/palette";

const W = 960;

type CountryData = { count: number; genre: GenreKey };

export function WorldMap() {
  const { all, filters, setCountry } = useExplorer();
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; count: number } | null>(
    null,
  );

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/countries.geojson`)
      .then((r) => r.json())
      .then((d: FeatureCollection) => {
        // Antarctica balloons and empties Mercator; drop it.
        const features = d.features.filter(
          (f) => f.properties?.iso !== "AQ" && f.properties?.name !== "Antarctica",
        );
        setGeo({ type: "FeatureCollection", features });
      });
  }, []);

  // Aggregate over every filter EXCEPT country, so selecting a country still
  // leaves the rest of the map coloured (self-excluding cross-filter).
  const byIso = useMemo(() => {
    const watches = filterWatches(all, { ...filters, country: null });
    const seen = new Map<string, Set<number>>();
    const tally = new Map<string, Map<GenreKey, number>>();
    for (const w of watches) {
      const f = w.film;
      if (!f) continue;
      const g = primaryGenre(f);
      for (const iso of f.production_countries ?? []) {
        let ids = seen.get(iso);
        if (!ids) seen.set(iso, (ids = new Set()));
        if (ids.has(f.tmdb_id)) continue;
        ids.add(f.tmdb_id);
        let t = tally.get(iso);
        if (!t) tally.set(iso, (t = new Map()));
        t.set(g, (t.get(g) ?? 0) + 1);
      }
    }
    const out = new Map<string, CountryData>();
    for (const [iso, ids] of seen) {
      const t = tally.get(iso)!;
      let genre: GenreKey = "Other";
      let best = -1;
      for (const g of [...GENRE_ORDER, "Other"] as GenreKey[]) {
        const n = t.get(g) ?? 0;
        if (n > best) [best, genre] = [n, g];
      }
      out.set(iso, { count: ids.size, genre });
    }
    return out;
  }, [all, filters]);

  const maxCount = useMemo(
    () => [...byIso.values()].reduce((m, d) => Math.max(m, d.count), 1),
    [byIso],
  );

  // Mercator fit to width; height derived from the land bounds, then shifted so
  // the top of the land sits at y=0 (fills the rectangle, no polar infinity).
  const { path, H } = useMemo(() => {
    if (!geo) return { path: null as ReturnType<typeof geoPath> | null, H: 480 };
    // Centre ~10E so the antimeridian seam falls in the Pacific and Russia's
    // far-east tip stays on the right instead of wrapping to the left edge.
    const proj = geoMercator().rotate([-10, 0]).fitWidth(W, geo);
    const b = geoPath(proj).bounds(geo);
    const [tx, ty] = proj.translate();
    proj.translate([tx, ty - b[0][1]]);
    return { path: geoPath(proj), H: Math.ceil(b[1][1] - b[0][1]) };
  }, [geo]);

  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="World map of films by production country, filled by genre">
        {/* ocean */}
        <rect x={0} y={0} width={W} height={H} fill={INK.surface} />
        {path &&
          geo?.features.map((f, i) => {
            const iso = (f.properties?.iso as string) || "";
            const data = byIso.get(iso);
            const sel = filters.country != null && filters.country === iso;
            const dim = filters.country != null && !sel;
            let fill = "#e7e5de"; // land with no films
            let opacity = 1;
            if (data) {
              fill = GENRE_COLORS[data.genre];
              opacity = 0.22 + 0.65 * Math.sqrt(data.count / maxCount);
              if (dim) opacity *= 0.35;
            } else if (dim) {
              opacity = 0.6;
            }
            return (
              <path
                key={i}
                data-iso={iso}
                d={path(f as Feature) ?? ""}
                fill={fill}
                fillOpacity={opacity}
                stroke={sel ? ACCENT : INK.surface}
                strokeWidth={sel ? 1.75 : 0.4}
                style={{ cursor: data ? "pointer" : "default" }}
                onMouseEnter={() => {
                  if (!data) return;
                  const c = path.centroid(f as Feature);
                  setHover({ x: c[0], y: c[1], name: (f.properties?.name as string) || iso, count: data.count });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => data && setCountry(iso)}
              />
            );
          })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs shadow"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, -130%)",
            background: INK.primary,
            color: INK.surface,
          }}
        >
          <div className="font-medium">{hover.name}</div>
          <div style={{ color: "#c3c2b7" }}>
            {hover.count} film{hover.count === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </figure>
  );
}
