"use client";

import { watchKey } from "@/lib/brush";
import { ACCENT, GENRE_COLORS, type GenreKey } from "@/lib/palette";
import type { EnrichedWatch } from "@/lib/types";

/**
 * The color that means "this is the thing you picked", for the current filter.
 *
 * Filtered to exactly one genre, the whole story takes that genre's color: the
 * reader has already said what they are looking at, and every highlight on the
 * page agreeing with the chip they clicked is what makes eight charts read as
 * one view. Crimson would be a second, competing claim on the same mark, and on
 * a Horror filter it would be the genre color anyway.
 *
 * Any other filter state falls back to the house accent. With two genres
 * selected there is no single right color, and inventing a blend would name a
 * category that does not exist.
 *
 * `tokens` defaults to the light set so pure callers (tests) see the same
 * colors this function always returned; charts pass the active theme's.
 */
export function accentFor(
  genres: Set<GenreKey | string>,
  tokens: { accent: string; genre: Record<GenreKey, string> } = {
    accent: ACCENT,
    genre: GENRE_COLORS,
  },
): string {
  if (genres.size !== 1) return tokens.accent;
  const only = [...genres][0] as GenreKey;
  // "Other" is excluded on purpose. It is a catch-all rather than an identity,
  // and its color is a chrome gray one step from the FADE used for everything
  // unselected, so taking it as the accent painted the highlight in almost
  // exactly the color of the things it was supposed to stand out from.
  if (only === "Other") return tokens.accent;
  return tokens.genre[only] ?? tokens.accent;
}

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
