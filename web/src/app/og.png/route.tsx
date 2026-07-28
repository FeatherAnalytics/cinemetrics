import { ImageResponse } from "next/og";
import dataset from "../../../public/data/cinemetrics.json";
import { INK, ACCENT } from "@/lib/palette";
import { datasetCounts, eyebrow, summaryLine } from "@/lib/summary";

/**
 * The share card, served at /cinemetrics/og.png.
 *
 * A Route Handler rather than the `opengraph-image` file convention on purpose.
 * Under `output: "export"` the convention writes an extensionless file
 * (`out/opengraph-image`), and GitHub Pages types responses by extension - so it
 * would ship as application/octet-stream and the stricter scrapers would skip
 * it. A dotted route segment puts the `.png` back in the path. layout.tsx points
 * og:image and twitter:image here by hand.
 *
 * Counts come from the same JSON the page imports, so the card cannot drift from
 * the dashboard. It is rebuilt on every deploy, which the daily data update
 * triggers.
 */

const { startYear, endYear, years, filmCount } = datasetCounts(dataset);
const LINE = summaryLine(years, filmCount);

export const size = { width: 1200, height: 630 };

// Required under `output: "export"`: nothing here reads the request, so a static
// build is honest, and Next needs it stated to emit the file.
export const dynamic = "force-static";

// No `fonts` option: next/og falls back to the Geist Regular it bundles, the
// same family the site sets for body text. Supplying our own would mean
// committing a font binary or fetching one, and the build has no network
// guarantee.
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: INK.surface,
          padding: "0 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: INK.muted,
          }}
        >
          {eyebrow(startYear, endYear)}
        </div>

        {/* Baseline-aligned so the accent period sits on the wordmark's baseline
            rather than the line box's. */}
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 28 }}>
          <div style={{ fontSize: 150, color: INK.primary, letterSpacing: -4 }}>
            cinemetrics
          </div>
          <div style={{ fontSize: 150, color: ACCENT, letterSpacing: -4 }}>.</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 24,
            maxWidth: 960,
            fontSize: 40,
            lineHeight: 1.35,
            color: INK.secondary,
          }}
        >
          {LINE}
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 26, color: INK.muted }}>
          featheranalytics.dev/cinemetrics
        </div>
      </div>
    ),
    size,
  );
}
