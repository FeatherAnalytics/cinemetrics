import { describe, it, expect } from "vitest";
import {
  anova,
  anovaCaption,
  ceilTo,
  chicagoParts,
  dayOfYearFixed,
  calendarDaysPerMonth,
  fPValue,
  hasKnownRewatchState,
  insetRect,
  monthSpan,
  NO_DATA_STROKE,
  paceLabel,
  quantile,
  ticksEvery,
  tukey,
} from "../statsChart";
import type { EnrichedWatch } from "../types";

describe("chicagoParts", () => {
  // The stored date IS the Chicago calendar date, so these must come straight
  // off the string. A UTC->Chicago conversion would shift each one back a day.
  it("reads month, weekday and year off the string with no timezone shift", () => {
    expect(chicagoParts("2024-10-15")).toEqual({ month: 9, dow: 1, year: 2024 });
  });

  it("does not roll a date backwards at midnight", () => {
    // 2024-01-01 was a Monday. Any UTC-to-Chicago conversion would make it
    // Sunday 2023-12-31 instead.
    expect(chicagoParts("2024-01-01")).toEqual({ month: 0, dow: 0, year: 2024 });
  });

  it("puts Sunday last, not first", () => {
    expect(chicagoParts("2024-10-13").dow).toBe(6); // a Sunday
    expect(chicagoParts("2024-10-14").dow).toBe(0); // the Monday after
  });
});

describe("dayOfYearFixed", () => {
  it("puts a calendar date at the same index in leap and common years", () => {
    // March 1 must be 60 in both, or year lines compare different days.
    expect(dayOfYearFixed(2, 1)).toBe(60);
  });

  it("reserves the leap slot so Feb 29 never collides with Mar 1", () => {
    expect(dayOfYearFixed(1, 29)).toBe(59);
    expect(dayOfYearFixed(2, 1)).toBe(60);
  });

  it("starts at zero and ends within the 366-slot frame", () => {
    expect(dayOfYearFixed(0, 1)).toBe(0);
    expect(dayOfYearFixed(11, 31)).toBe(365);
  });
});

describe("calendarDaysPerMonth", () => {
  it("counts WHOLE months, not the days actually observed", () => {
    // Jan 30 to Feb 2 touches two months, so both count in full.
    const m = calendarDaysPerMonth(["2021-01-30", "2021-02-02"]);
    expect(m[0]).toBe(31);
    expect(m[1]).toBe(28);
    expect(m[2]).toBe(0);
  });

  it("gives February 29 days in a leap year", () => {
    expect(calendarDaysPerMonth(["2020-02-10", "2020-02-11"])[1]).toBe(29);
  });

  it("sums each month across every year it appears in", () => {
    // Jan 2020 (31, leap year irrelevant) + Jan 2021 (31) = 62.
    const m = calendarDaysPerMonth(["2020-01-05", "2021-01-05"]);
    expect(m[0]).toBe(62);
    // Every intervening month is counted once.
    expect(m[5]).toBe(30);
  });

  it("does not shorten a partial first month", () => {
    // The log starting on the 30th must not make January an 2-day month.
    expect(calendarDaysPerMonth(["2021-01-30", "2021-01-31"])[0]).toBe(31);
  });

  it("returns zeros for no dates", () => {
    expect(calendarDaysPerMonth([]).every((v) => v === 0)).toBe(true);
  });
});

describe("monthSpan", () => {
  it("fills gaps so an empty month still gets a column", () => {
    expect(monthSpan(["2020-11-04", "2021-02-01"])).toEqual([
      "2020-11",
      "2020-12",
      "2021-01",
      "2021-02",
    ]);
  });

  it("returns a single month when everything lands in one", () => {
    expect(monthSpan(["2020-11-04", "2020-11-20"])).toEqual(["2020-11"]);
  });

  it("is empty for no dates", () => {
    expect(monthSpan([])).toEqual([]);
  });
});

describe("ticksEvery / ceilTo", () => {
  it("steps at a round interval rather than a share of the total", () => {
    expect(ticksEvery(300, 100)).toEqual([0, 100, 200, 300]);
  });

  it("pads the ceiling up so the top tick is never clipped", () => {
    // 794 watches must not stop the axis at 700.
    expect(ceilTo(794, 100)).toBe(800);
    expect(ticksEvery(ceilTo(794, 100), 100)).toContain(800);
  });

  it("leaves an exact multiple alone", () => {
    expect(ceilTo(800, 100)).toBe(800);
  });

  it("includes the endpoint despite float drift", () => {
    // 0.1 steps accumulate error; the epsilon in ticksEvery covers it.
    expect(ticksEvery(0.3, 0.1)).toHaveLength(4);
  });
});

describe("paceLabel", () => {
  it("inverts a rate into days between films", () => {
    expect(paceLabel(0.5)).toBe("2.0");
    expect(paceLabel(0.25)).toBe("4.0");
  });

  it("renders a zero rate as a dash rather than infinity", () => {
    expect(paceLabel(0)).toBe("-");
  });
});

describe("insetRect", () => {
  it("keeps the stroke inside the original bounds", () => {
    const r = insetRect(10, 20, 30, 40);
    expect(r.x).toBe(10 + NO_DATA_STROKE / 2);
    expect(r.y).toBe(20 + NO_DATA_STROKE / 2);
    // Outer edge lands exactly on the original edge.
    expect(r.x + r.width + NO_DATA_STROKE / 2).toBe(40);
    expect(r.y + r.height + NO_DATA_STROKE / 2).toBe(60);
  });

  it("never produces a negative size for a zero-height mark", () => {
    const r = insetRect(0, 0, 0, 0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe("hasKnownRewatchState", () => {
  const w = (liked: boolean | null) => ({ liked }) as EnrichedWatch;

  it("treats a null like as an unrecorded rewatch state", () => {
    expect(hasKnownRewatchState(w(null))).toBe(false);
  });

  it("accepts both like values as recorded", () => {
    expect(hasKnownRewatchState(w(true))).toBe(true);
    expect(hasKnownRewatchState(w(false))).toBe(true);
  });
});

describe("quantile", () => {
  it("interpolates between neighbors", () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
  });

  it("returns 0 for an empty array rather than NaN", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("tukey", () => {
  it("puts whiskers on real values, not the fence itself", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const b = tukey(s);
    expect(b.lo).toBe(1);
    expect(b.hi).toBe(9);
    expect(b.outliers).toEqual([]);
  });

  it("splits out points past 1.5 IQR", () => {
    const s = [...Array(20).fill(50), 100];
    const b = tukey(s.sort((a, c) => a - c));
    expect(b.outliers).toContain(100);
    expect(b.hi).toBe(50);
  });

  it("orders the quartiles", () => {
    const b = tukey([10, 20, 30, 40, 50]);
    expect(b.q1).toBeLessThanOrEqual(b.med);
    expect(b.med).toBeLessThanOrEqual(b.q3);
  });
});

describe("fPValue", () => {
  // Published critical values: p must come back at the stated alpha.
  it.each([
    [4.9646, 1, 10, 0.05],
    [3.4903, 3, 12, 0.05],
    [7.5594, 2, 10, 0.01],
    [2.5382, 6, 20, 0.05],
  ])("F(%f, %i, %i) is about p=%f", (F, df1, df2, want) => {
    expect(fPValue(F, df1, df2)).toBeCloseTo(want, 2);
  });

  it("is monotone decreasing in F", () => {
    const ps = [0.1, 0.5, 1, 2, 5, 20].map((F) => fPValue(F, 4, 100));
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThanOrEqual(ps[i - 1]);
  });

  it("returns 1 for a non-positive F rather than NaN", () => {
    expect(fPValue(0, 3, 10)).toBe(1);
    expect(fPValue(-1, 3, 10)).toBe(1);
  });
});

describe("anova", () => {
  it("finds no effect when every group has the same mean", () => {
    const a = anova([
      [10, 20, 30],
      [10, 20, 30],
      [10, 20, 30],
    ])!;
    expect(a.eta2).toBeCloseTo(0, 6);
    expect(a.p).toBeGreaterThan(0.9);
  });

  it("finds a large effect when groups are far apart", () => {
    const a = anova([
      [1, 2, 3],
      [100, 101, 102],
    ])!;
    expect(a.eta2).toBeGreaterThan(0.9);
    expect(a.p).toBeLessThan(0.001);
  });

  it("reports degrees of freedom as k-1 and n-k", () => {
    const a = anova([
      [1, 2],
      [3, 4],
      [5, 6],
    ])!;
    expect(a.df1).toBe(2);
    expect(a.df2).toBe(3);
    expect(a.n).toBe(6);
  });

  it("ignores empty groups instead of counting them", () => {
    const a = anova([[1, 2], [], [3, 4]])!;
    expect(a.df1).toBe(1);
    expect(a.n).toBe(4);
  });

  it("returns null when there is nothing to compare", () => {
    expect(anova([[1, 2, 3]])).toBeNull();
    expect(anova([])).toBeNull();
  });

  it("returns null rather than infinity when within-group variance is zero", () => {
    expect(anova([[5, 5], [9, 9]])).toBeNull();
  });
});

describe("anovaCaption", () => {
  it("withholds the effect size when the test does not clear alpha", () => {
    const caption = anovaCaption(
      { eta2: 0.4, F: 1.05, df1: 11, df2: 782, p: 0.401, n: 794 },
      "Month",
    );
    expect(caption).toContain("No significant");
    expect(caption).not.toContain("eta²");
    expect(caption).not.toContain("40.0%");
  });

  it("quotes the effect size once the test clears alpha", () => {
    const caption = anovaCaption(
      { eta2: 0.25, F: 9.1, df1: 3, df2: 200, p: 0.0001, n: 204 },
      "Month",
    );
    expect(caption).toContain("25.0%");
    expect(caption).toContain("eta²");
    expect(caption).toContain("p = <0.001");
  });

  it("says so plainly when there is nothing to test", () => {
    expect(anovaCaption(null, "Month")).toContain("Not enough");
  });
});
