// Small text-formatting helpers shared across the charts.

/** Truncate to n characters, replacing the tail with an ellipsis when over. */
export function trunc(s: string, n = 26): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
