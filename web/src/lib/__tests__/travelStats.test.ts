import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { computeTravelStats, ratioLabel, signedLabel, TRIP_GAP_DAYS } from "../travelStats";
import { TRAVEL_DAYS } from "../travel";
import type { Dataset } from "../types";

const data = dataset as unknown as Dataset;
const s = computeTravelStats(data);

/** The ordinary side rebuilt from the payload, independently of `computeTravelStats`. */
const ordinaryDates = new Set(
  data.watches.filter((w) => !TRAVEL_DAYS[w.date]).map((w) => w.date),
);
const ordinaryRatings = data.watches
  .filter((w) => !TRAVEL_DAYS[w.date] && w.rating != null)
  .map((w) => w.rating as number);

/**
 * The figures the three prototypes were reviewed against, recomputed from the
 * SHIPPED payload rather than a fixture.
 *
 * A fixture would let all three prototypes agree with each other while every one
 * of them disagreed with the site, which is the failure that matters here: the
 * page prints these numbers as claims about a real watch log.
 *
 * THE TRAVEL SIDE IS PINNED AND THE ORDINARY SIDE IS NOT. `TRAVEL_DAYS` is ten
 * historical dates that cannot grow, so 10 days and 21 watches are facts. The
 * ordinary side is everything else, and a daily job appends to it, so a literal
 * `691` there would be red tomorrow for no reason. Following the policy already
 * written out in `statsChart.test.ts`, every ordinary-side figure is asserted as
 * a relationship: either recomputed independently from the payload, or held to
 * the band the finding actually needs. The figures in the comments are what the
 * payload said when this was written.
 */
describe("the travel split against the shipped watch log", () => {
  it("counts ten travel days holding twenty-one watches", () => {
    expect(s.travel.days).toBe(10);
    expect(s.travel.watches).toBe(21);
  });

  it("puts every other viewing day on the ordinary side, and none twice", () => {
    // The slip this catches is comparing the flights against the WHOLE log, which
    // would leave the ten busiest-in-kind days on both sides of every ratio.
    // 691 ordinary days holding 774 watches when this was written.
    //
    // EXHAUSTIVE: the two sides account for every viewing day and every watch.
    expect(s.travel.days + s.ordinary.days).toBe(new Set(data.watches.map((w) => w.date)).size);
    expect(s.travel.watches + s.ordinary.watches).toBe(data.watches.length);
    // DISJOINT, recomputed from `TRAVEL_DAYS` rather than inferred from the sums
    // above. A split that counted the travel days on both sides would still add
    // up if the travel side were then dropped from the total; this would not.
    expect(s.ordinary.days).toBe(ordinaryDates.size);
    expect(s.ordinary.watches).toBe(data.watches.filter((w) => !TRAVEL_DAYS[w.date]).length);
    for (const d of s.days) expect(ordinaryDates.has(d.date), d.date).toBe(false);
  });

  it("measures 2.10 films on a travel day against about 1.1 on an ordinary one", () => {
    expect(s.travel.filmsPerDay).toBeCloseTo(2.1, 4);
    expect(s.filmsPerDayRatio).toBeCloseTo(s.travel.filmsPerDay / s.ordinary.filmsPerDay, 10);
    // 1.1201 ordinary films per day, a ratio of 1.8748, when this was written.
    // The ordinary side grows with every appended watch, so what is held is the
    // finding: an ordinary viewing day holds more than one film and a travel day
    // holds at least half again as many. The upper bound on the ordinary rate is
    // the ratio, which is where the claim lives, rather than a second band.
    expect(s.ordinary.filmsPerDay).toBeGreaterThan(1);
    expect(s.filmsPerDayRatio).toBeGreaterThan(1.5);
    // The headline rounds to 1.9x. Asserted as the STRING the charts print, since
    // a ratio of 1.8748 could be captioned 1.8x by a different rounding. This one
    // stays a literal on purpose: if the ratio ever drifts past 1.95 the page
    // starts printing 2.0x, and that is a change to the finding, not to the data.
    expect(ratioLabel(s.filmsPerDayRatio)).toBe("1.9x");
  });

  it("finds 7 of 10 travel days multi-film against about 1 ordinary day in 9", () => {
    expect(s.travel.multiFilmDays).toBe(7);
    expect(s.travel.multiFilmShare).toBeCloseTo(0.7, 6);
    // 77 of 691 ordinary days, an 11.1% share, when this was written. The count
    // is recomputed rather than pinned; the share is held to the band that keeps
    // "a travel day is several times likelier" true.
    const ordinaryCounts = new Map<string, number>();
    for (const w of data.watches) {
      if (TRAVEL_DAYS[w.date]) continue;
      ordinaryCounts.set(w.date, (ordinaryCounts.get(w.date) ?? 0) + 1);
    }
    expect(s.ordinary.multiFilmDays).toBe(
      [...ordinaryCounts.values()].filter((n) => n > 1).length,
    );
    expect(s.ordinary.multiFilmShare).toBeCloseTo(s.ordinary.multiFilmDays / s.ordinary.days, 10);
    expect(s.multiFilmRatio).toBeCloseTo(s.travel.multiFilmShare / s.ordinary.multiFilmShare, 10);
    expect(s.multiFilmRatio).toBeGreaterThan(3);
  });
});

describe("the rating gap, which is the finding the page must NOT make", () => {
  it("holds the two means and the identical medians", () => {
    expect(s.travel.meanRating).toBeCloseTo(71.9048, 4);
    // 73.4755 when written, and it moves with every appended watch. Recomputed
    // from the payload rather than pinned, which still catches the slip that
    // matters: a mean taken over the WHOLE log instead of the ordinary side.
    expect(s.ordinary.meanRating).toBeCloseTo(
      ordinaryRatings.reduce((a, b) => a + b, 0) / ordinaryRatings.length,
      10,
    );
    // Both medians are 70. The single most direct evidence that the 1.6-point gap
    // in the means is not a shift in how I rate a film on a plane.
    expect(s.travel.medianRating).toBe(70);
    expect(s.ordinary.medianRating).toBe(70);
    expect(s.travel.medianRating).toBe(s.ordinary.medianRating);
  });

  it("puts zero inside the interval, so the gap is noise", () => {
    // −1.5707 points, se 2.7717, interval [−7.0032, 3.8618] when written. None of
    // those four is the claim, and all four move as the ordinary side grows, so
    // what is held is that the interval is the 95% one centered on the gap.
    expect(s.ratingDiff).toBeCloseTo(s.travel.meanRating - s.ordinary.meanRating, 10);
    expect(s.ratingDiffSe).toBeCloseTo(Math.hypot(s.travel.seRating, s.ordinary.seRating), 10);
    expect((s.ratingDiffCi[0] + s.ratingDiffCi[1]) / 2).toBeCloseTo(s.ratingDiff, 10);
    expect(s.ratingDiffCi[1] - s.ratingDiffCi[0]).toBeCloseTo(2 * 1.96 * s.ratingDiffSe, 10);
    // The whole reason `ratingGapIsNoise` exists. The gap is smaller than its own
    // standard error, so the interval spans zero and a chart claiming "I rate
    // flight films worse" would be stating a difference the data does not hold.
    expect(s.ratingDiffCi[0]).toBeLessThan(0);
    expect(s.ratingDiffCi[1]).toBeGreaterThan(0);
    expect(s.ratingGapIsNoise).toBe(true);
    expect(Math.abs(s.ratingDiff)).toBeLessThan(s.ratingDiffSe);
  });

  it("labels the gap with a true minus sign, not a hyphen", () => {
    // The rounding cases run on fixed inputs, because −1.5707 sits close enough
    // to the −1.55 boundary that one appended watch could move the label.
    expect(signedLabel(-1.5707)).toBe("−1.6");
    expect(signedLabel(0)).toBe("0.0");
    expect(signedLabel(2.25)).toBe("+2.3");
    // And whatever the gap currently is, the page gets U+2212 and not a hyphen.
    expect(signedLabel(s.ratingDiff)).toMatch(/^−\d+\.\d$/);
  });

  it("rates every travel watch, so no mean rests on a silent subset", () => {
    expect(s.travel.ratingN).toBe(s.travel.watches);
    expect(s.ordinary.ratingN).toBe(s.ordinary.watches);
  });
});

describe("the days and trips the prototypes name", () => {
  it("keeps the ten days in date order with the leg each was recorded on", () => {
    expect(s.days.map((d) => d.date)).toEqual(Object.keys(TRAVEL_DAYS).sort());
    for (const d of s.days) expect(d.leg, d.date).toBe(TRAVEL_DAYS[d.date]);
  });

  it("holds 1 to 4 films per day, which is the whole of prototype 1", () => {
    const counts = s.days.map((d) => d.films.length);
    expect(counts).toEqual([4, 1, 2, 2, 2, 3, 1, 2, 1, 3]);
    expect(Math.min(...counts)).toBe(1);
    expect(Math.max(...counts)).toBe(4);
  });

  it("names every film it draws", () => {
    // The placeholder branch. A watch whose film is missing from `films` is a
    // broken export, and the page should say `#12345` rather than draw a nameless
    // cell, so nothing here should be reaching that branch today.
    for (const d of s.days) {
      for (const f of d.films) expect(f.title, d.date).not.toMatch(/^#\d+$/);
    }
  });

  it("groups the ten days into four trips", () => {
    expect(s.trips.map((t) => t.label)).toEqual([
      "September 2019",
      "October 2019",
      "December 2021",
      "October 2023",
    ]);
    expect(s.trips.map((t) => t.days.length)).toEqual([3, 3, 2, 2]);
    expect(s.trips.map((t) => t.watches)).toEqual([7, 7, 3, 4]);
    expect(s.trips.reduce((a, t) => a + t.watches, 0)).toBe(s.travel.watches);
  });

  it("splits the trips on a gap no threshold from 8 to 18 days would move", () => {
    // Asserts the MARGIN rather than trusting the comment on TRIP_GAP_DAYS. If the
    // widest within-trip gap ever meets the narrowest between-trip gap, the
    // threshold has become a fitted value and needs a real rule instead.
    const gaps = (ds: string[]) =>
      ds.slice(1).map((d, i) => (Date.parse(d) - Date.parse(ds[i])) / 86_400_000);
    const within = s.trips.flatMap((t) => gaps(t.days.map((d) => d.date)));
    const between = s.trips
      .slice(1)
      .map(
        (t, i) =>
          (Date.parse(t.days[0].date) -
            Date.parse(s.trips[i].days[s.trips[i].days.length - 1].date)) /
          86_400_000,
      );
    expect(Math.max(...within)).toBe(7);
    expect(Math.min(...between)).toBe(19);
    expect(Math.max(...within)).toBeLessThan(TRIP_GAP_DAYS);
    expect(Math.min(...between)).toBeGreaterThan(TRIP_GAP_DAYS);
  });
});

describe("the rating ramp domain", () => {
  it("spans the whole library, not the 21 travel watches", () => {
    // Deliberate. A ramp fitted to the travel films alone would stretch 50-90
    // across its full range and make those 21 ratings look spread out, which is
    // the opposite of what the data says. Against the library's own 20-100 the
    // columns read as uniformly mid-tone, which agrees with the null result.
    expect(s.ratingDomain).toEqual([20, 100]);
    const travelRatings = s.days.flatMap((d) => d.films.map((f) => f.rating));
    expect(Math.min(...(travelRatings as number[]))).toBe(50);
    expect(Math.max(...(travelRatings as number[]))).toBe(90);
    expect(s.ratingDomain[0]).toBeLessThan(50);
    expect(s.ratingDomain[1]).toBeGreaterThan(90);
  });
});
