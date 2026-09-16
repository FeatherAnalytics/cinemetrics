import { ImageResponse } from "next/og";
import { INK, ACCENT } from "@/lib/palette";
import { STORIES } from "@/lib/stories";

const STORY_HEADLINES: Record<string, string> = {
  heart: "Where the heart falls",
  spooktober: "October horror ritual",
  "hidden-gems": "Films nobody else watched",
  runtime: "How long, how good",
  "getting-pickier": "Eight years of ratings",
  binges: "Days with two or more",
  franchises: "Multi-film arcs",
  stats: "The shape of it",
  watchlist: "Films waiting to be watched",
};

export const size = { width: 1200, height: 630 };
export const dynamic = "force-static";

export function generateStaticParams() {
  return STORIES.map((s) => ({ story: s.id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ story: string }> }) {
  const { story } = await params;
  const headline = STORY_HEADLINES[story] ?? story;
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
          cinemetrics
        </div>
        <div style={{ display: "flex", marginTop: 28 }}>
          <div style={{ fontSize: 100, color: INK.primary, letterSpacing: -2 }}>
            {headline}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: ACCENT }}>
          featheranalytics.dev/cinemetrics
        </div>
      </div>
    ),
    size,
  );
}
