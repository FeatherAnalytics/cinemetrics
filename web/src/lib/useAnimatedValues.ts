"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 480;

/** d3.easeCubicOut, inlined. One expression is cheaper than the import. */
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * WHICH CHARTS TWEEN, AND WHY THE REST DO NOT. Measured, not assumed.
 *
 * Tweening: the eight bar charts; `RollingRating` (per panel); `RewatchCadence`
 * and `FranchiseRuns` (per row).
 *
 * Left instant, each for a reason a rebuild would have to disprove again:
 *
 *   SwimLaneChart. A dot's y is its lane (the watch year) plus its rating, and
 *   the lane bounds come from the UNFILTERED log, so a filter cannot move one.
 *   Measured on the 795-dot field: the multiset of y positions is identical
 *   before and after a genre filter, the same 58 values with the same counts.
 *   Wiring the hook up anyway put 488 of 495 trackable marks in flight, because
 *   the layer is re-sorted so the selected dot paints last and index i is a
 *   different watch afterward. That is a dot gliding to a position another film
 *   already held. Cost, six toggles each, 120Hz display, no CPU throttle: 96.3
 *   fps mean with the tween against 109.8 without, 24 frames over 16.7ms
 *   against 12, no long task from the tween itself either way. It clears the
 *   plan's 60fps bar comfortably. It was removed for being meaningless, not for
 *   being slow.
 *
 *   ResidualDotStack. 207 dots to 27 under one genre filter, and the OLS refits,
 *   so no dot keeps a partner to move from.
 *
 *   StreakStripes. 795 stripes to 94 under the same filter, so there is no
 *   stripe-to-stripe pairing, and a stripe's fill is scored against the median
 *   of the whole log, which a filter never moves. There is no colour change to
 *   interpolate.
 *
 * With the three converted charts in one page, a genre toggle runs at 109.9 fps
 * mean against 108.3 with reduced motion on: the tween is free at this scale.
 *
 * Tween a numeric series toward its next value.
 *
 * Filtering is the point of this dashboard and it currently happens with no
 * visual continuity, so the reader never sees that the bars they are looking
 * at are the bars that responded. Motion carries that, and nothing else does.
 *
 * A length change resets instead of interpolating: a different number of marks
 * is a different chart, and pairing bar 3 of the old series with bar 3 of the
 * new one would animate a lie.
 *
 * `from` holds the position the marks are actually at, updated on every frame
 * rather than at the ends of a tween. A reader who filters twice in half a
 * second interrupts the first tween, and the second one has to pick the marks
 * up where they are. Recording the position in the effect's cleanup cannot do
 * that: the effect only re-runs when `target` changes, so its cleanup closes
 * over the state as of the *start* of the tween being interrupted, and the
 * marks would jump back to their origin before easing forward.
 *
 * CALLER REQUIREMENT: `target` is compared by identity. A caller that rebuilds
 * the array every render restarts the tween every frame and nothing ever moves.
 * Memoise it.
 */
export function useAnimatedValues(target: number[]): number[] {
  const [values, setValues] = useState(target);
  const from = useRef(target);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from.current.length !== target.length) {
      from.current = target;
      setValues(target);
      return;
    }

    const start = performance.now();
    const base = from.current;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const k = ease(t);
      const next = t === 1 ? target : base.map((v, i) => v + (target[i] - v) * k);
      from.current = next;
      setValues(next);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target]);

  // A length change is handled in the effect, which runs after the render that
  // brought the new target in. That one render would otherwise hand back the
  // previous series, and a caller indexing by its own mark index reads
  // undefined off the end of it: NaN in an SVG geometry attribute, committed
  // and painted before the effect corrects it. Serve the target until the
  // effect has caught up.
  return values.length === target.length ? values : target;
}
