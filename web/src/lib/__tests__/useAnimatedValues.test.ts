import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimatedValues } from "../useAnimatedValues";

const DURATION = 480;
const FRAME = 16;

/** easeCubicOut, restated here so the tests do not import the hook's own copy. */
const ease = (t: number) => 1 - (1 - t) ** 3;

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("useAnimatedValues", () => {
  beforeEach(() => {
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts at the first values it is given, with no animation in", () => {
    const { result } = renderHook(() => useAnimatedValues([1, 2, 3]));
    expect(result.current).toEqual([1, 2, 3]);
  });

  it("returns the target immediately when the reader asked for reduced motion", () => {
    stubReducedMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { result, rerender } = renderHook(({ v }) => useAnimatedValues(v), {
      initialProps: { v: [1, 2, 3] },
    });
    rerender({ v: [9, 9, 9] });
    expect(result.current).toEqual([9, 9, 9]);
    // Not "arrives at the target quickly" but "never schedules a frame at all".
    expect(raf).not.toHaveBeenCalled();
  });

  it("lands exactly on the target when the tween finishes", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useAnimatedValues(v), {
      initialProps: { v: [0, 0] },
    });
    rerender({ v: [10, 20] });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual([10, 20]);
  });

  it("resets rather than interpolating when the series length changes", () => {
    const { result, rerender } = renderHook(({ v }) => useAnimatedValues(v), {
      initialProps: { v: [1, 2, 3] },
    });
    // A different number of bars is a different chart, not the same bars moving.
    rerender({ v: [5, 5] });
    expect(result.current).toEqual([5, 5]);
  });

  it("never returns a series of a different length than the one asked for", () => {
    // The reset happens in an effect, so the render BETWEEN the new target
    // arriving and that effect firing is the one at risk. A chart indexing the
    // result by its own bar index reads undefined there, and undefined lands in
    // an SVG geometry attribute as NaN. Every render is checked, not just the
    // last one, because only the last one is settled.
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ v }: { v: number[] }) => {
        const got = useAnimatedValues(v);
        seen.push(`${v.length}->${got.length}`);
        return got;
      },
      { initialProps: { v: [1, 2, 3] } },
    );
    rerender({ v: [5, 5] });
    rerender({ v: [7, 7, 7, 7] });
    expect(seen.filter((s) => s.split("->")[0] !== s.split("->")[1])).toEqual([]);
  });

  it("hands an interrupted tween its position on screen, not its origin", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useAnimatedValues(v), {
      initialProps: { v: [0] },
    });

    rerender({ v: [100] });
    await act(async () => {
      vi.advanceTimersByTime(DURATION / 2);
    });
    // Halfway through 0 -> 100 in clock time, which cubic-out puts at
    // 100 * ease(0.5) = 100 * (1 - 0.5 ** 3) = 87.5.
    const onScreen = 100 * ease(0.5);
    expect(result.current[0]).toBeCloseTo(onScreen, 6);

    // Interrupt toward a third value one frame after the mark reached 87.5.
    rerender({ v: [200] });
    await act(async () => {
      vi.advanceTimersByTime(FRAME);
    });

    // A mark at 87.5 heading for 200 can only move up. Resuming from the
    // origin instead would put it near 200 * ease(16 / 480) = 19.3, a visible
    // jump backward before the ease forward.
    const expected = onScreen + (200 - onScreen) * ease(FRAME / DURATION);
    expect(result.current[0]).toBeGreaterThan(onScreen);
    expect(result.current[0]).toBeCloseTo(expected, 6);
  });
});
