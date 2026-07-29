"use client";

import { useTheme } from "@/lib/theme";

/**
 * The pill switcher, matching the one on "Warming up or wearing out".
 *
 * Two different toggle treatments on one site is two different controls as far
 * as a reader is concerned, so this copies `RollingRating`'s markup rather than
 * inventing a second look.
 */
export function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { tokens } = useTheme();
  return (
    <div
      className="flex flex-wrap overflow-hidden rounded-full border text-xs"
      style={{
        borderColor: `color-mix(in srgb, ${tokens.ink.primary} 18%, transparent)`,
        width: "fit-content",
      }}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className="px-3 py-0.5 capitalize transition"
          style={{
            background: value === o ? tokens.ui.active : "transparent",
            color: value === o ? tokens.ui.activeText : tokens.ink.secondary,
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
