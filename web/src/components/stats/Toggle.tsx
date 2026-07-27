"use client";

import { ACCENT, INK } from "@/lib/palette";

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
  return (
    <div
      className="flex flex-wrap overflow-hidden rounded-full border text-xs"
      style={{ borderColor: "rgba(11,11,11,0.18)", width: "fit-content" }}
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
            background: value === o ? ACCENT : "transparent",
            color: value === o ? INK.surface : INK.secondary,
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
