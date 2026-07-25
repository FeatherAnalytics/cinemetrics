"use client";

import { watchKey } from "@/lib/brush";
import type { EnrichedWatch } from "@/lib/types";

/**
 * Turn a group of watches into a cross-filter selection, toggling off when the
 * same group is picked twice.
 *
 * Every stats chart shares this contract: clicking a mark populates the
 * SelectionPanel with exactly the watches behind that mark, and clicking it
 * again clears. Set identity is compared by content, not reference, because each
 * click builds a fresh Set.
 */
export function pickWatches(
  watches: EnrichedWatch[],
  current: Set<string> | null,
  setSelection: (keys: Set<string> | null) => void,
): void {
  const next = new Set(watches.map(watchKey));
  if (next.size === 0) return;
  if (current && current.size === next.size && [...next].every((k) => current.has(k))) {
    setSelection(null);
    return;
  }
  setSelection(next);
}

/** Whether `current` is exactly the selection this group of watches would make. */
export function isPicked(watches: EnrichedWatch[], current: Set<string> | null): boolean {
  if (!current || !watches.length) return false;
  if (current.size !== new Set(watches.map(watchKey)).size) return false;
  return watches.every((w) => current.has(watchKey(w)));
}
