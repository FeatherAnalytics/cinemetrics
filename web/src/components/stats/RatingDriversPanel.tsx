"use client";

import { useTheme, hairline } from "@/lib/theme";
import storyStats from "../../../public/data/story-stats.json";

function pLabel(p: number): string {
  if (p < 0.01) return "p < 0.01";
  return `p = ${p.toFixed(2)}`;
}

function reading(p: number, name: string): string {
  if (p < 0.01) return `${name} moves the median a few points`;
  if (p < 0.05) return `${name} has a modest effect`;
  return `${name} does not predict the rating`;
}

export function RatingDriversPanel() {
  const { tokens } = useTheme();
  const midPct = Math.round((storyStats.mid_rating_share ?? 0.77) * 100);

  const rows = [
    { label: "Month", p: storyStats.p_month },
    { label: "Genre", p: storyStats.p_genre },
    { label: "Weekday", p: storyStats.p_weekday },
  ];

  return (
    <div
      className="rounded-md border p-4"
      style={{
        background: "var(--surface-card)",
        borderColor: hairline(tokens.ink.primary, 9),
      }}
    >
      <p className="mb-3 text-sm" style={{ color: tokens.ink.secondary }}>
        Month and genre move my median a few points, but three in four ratings
        still land between 60 and 80.
      </p>
      <table className="w-full text-[12px]" style={{ color: tokens.ink.secondary }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1 font-medium" style={{ color: tokens.ink.primary }}>
                {r.label}
              </td>
              <td className="py-1 text-right font-mono text-[11px]">{pLabel(r.p)}</td>
              <td className="py-1 pl-3">{reading(r.p, r.label.toLowerCase())}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 font-mono text-[11px]" style={{ color: tokens.ink.muted }}>
        {midPct}% of ratings fall between 60 and 80
      </p>
    </div>
  );
}
