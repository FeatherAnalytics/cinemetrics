// Small text-formatting helpers shared across the charts.

/** Truncate to n characters, replacing the tail with an ellipsis when over. */
export function trunc(s: string, n = 26): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Format a number as an integer when whole, otherwise to one decimal place. */
export function fmt1(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}
