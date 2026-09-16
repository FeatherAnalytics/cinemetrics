"use client";

import { useEffect, useState } from "react";
import { useTheme, hairline } from "@/lib/theme";
import { MonthlyPace } from "./MonthlyPace";
import { ViewingsToDate } from "./ViewingsToDate";
import { ViewingVelocity } from "./ViewingVelocity";
import { MostRewatched } from "./MostRewatched";
import { RatingDriversPanel } from "./RatingDriversPanel";

const BEATS = [
  {
    headline: "I watch in bursts, not habits.",
    Chart: MonthlyPace,
  },
  {
    headline: "The pandemic is the shape of this dataset.",
    Chart: ViewingsToDate,
  },
  {
    headline: "When I stopped finding films, I started returning to them.",
    charts: [ViewingVelocity, MostRewatched],
  },
  {
    headline: "Small but real.",
    Panel: RatingDriversPanel,
  },
] as const;

export function StoryBeats({ children }: { children?: React.ReactNode }) {
  const { tokens } = useTheme();
  const [diveOpen, setDiveOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("dive") === "1"; }
    catch { return false; }
  });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (diveOpen) p.set("dive", "1"); else p.delete("dive");
    const qs = p.toString();
    const url = qs ? `${window.location.pathname}?${qs}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [diveOpen]);

  return (
    <div className="flex flex-col gap-8">
      {BEATS.map((beat, i) => (
        <section key={i}>
          <p
            className="mb-3 font-display text-lg font-semibold"
            style={{ color: tokens.ink.primary }}
          >
            {beat.headline}
          </p>
          {"Chart" in beat && beat.Chart && (
            <div
              className="rounded-md border p-4"
              style={{
                background: "var(--surface-card)",
                borderColor: hairline(tokens.ink.primary, 9),
              }}
            >
              <beat.Chart />
            </div>
          )}
          {"charts" in beat &&
            beat.charts.map((C, j) => (
              <div
                key={j}
                className="mt-3 rounded-md border p-4"
                style={{
                  background: "var(--surface-card)",
                  borderColor: hairline(tokens.ink.primary, 9),
                }}
              >
                <C />
              </div>
            ))}
          {"Panel" in beat && beat.Panel && <beat.Panel />}
        </section>
      ))}

      {children && (
        <details
          open={diveOpen}
          onToggle={(e) => setDiveOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: tokens.ink.muted }}
          >
            Deep dive
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-8">{children}</div>
        </details>
      )}
    </div>
  );
}
