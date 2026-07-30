import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { computeTravelStats, ratioLabel, signedLabel, TRIP_GAP_DAYS } from "../travelStats";
import { TRAVEL_DAYS } from "../travel";
import type { Dataset } from "../types";

const data = dataset as unknown as Dataset;
const s = computeTravelStats(data);

/**
 * The figures the three prototypes were reviewed against, recomputed from the
 * SHIPPED payload rather than a fixture.
 *
 * A fixture would let all three prototypes agree with each other while every one
 * of them disagreed with the site, which is the failure that matters here: the
 * page prints these numbers as claims about a real watch log. Pinned to the
 * decimal so a change in the data breaks the test instead of quietly restating
 * the charts' captions.
 */
describe("the travel split against the shipped watch log", () => {
  it("counts ten travel days holding twenty-one watches", () => {
    expect(s.travel.days).toBe(10);
    expect(s.travel.watches).toBe(21);
  });

  it("puts every other viewing day on the ordinary side, and none twice", () => {
    // The slip this catches is comparing the flights against the WHOLE log, which
    // would leave the ten busiest-in-kind days on both sides of every ratio.
    expect(s.ordinary.days).toBe(691);
    expect(s.ordinary.watches).toBe(774);
    expect(s.travel.days + s.ordinary.days).toBe(new Set(data.watches.map((w) => w.date)).size);
    expect(s.travel.watches + s.ordinary.watches).toBe(data.watches.length);
  });

  it("measures 2.10 films on a travel day against 1.12 on an ordinary one", () => {
    expect(s.travel.filmsPerDay).toBeCloseTo(2.1, 4);
    expect(s.ordinary.filmsPerDay).toBeCloseTo(1.1201, 4);
    expect(s.filmsPerDayRatio).toBeCloseTo(1.8748, 4);
    // The headline rounds to 1.9x. Asserted as the STRING the charts print, since
    // a ratio of 1.8748 could be captioned 1.8x by a different rounding.
    expect(ratioLabel(s.filmsPerDayRatio)).toBe("1.9x");
  });

  it("finds 7 of 10 travel days multi-film against 77 of 691 ordinary ones", () => {
    expect(s.travel.multiFilmDays).toBe(7);
    expect(s.ordinary.multiFilmDays).toBe(77);
    expect(s.travel.multiFilmShare).toBeCloseTo(0.7, 6);
    expect(s.ordinary.multiFilmShare).toBeCloseTo(0.1114, 4);
    expect(s.multiFilmRatio).toBeCloseTo(6.2818, 4);
  });
});

describe("the rating gap, which is the finding the page must NOT make", () => {
  it("holds the two means and the identical medians", () => {
    expect(s.travel.meanRating).toBeCloseTo(71.9048, 4);
    expect(s.ordinary.meanRating).toBeCloseTo(73.4755, 4);
    // Both medians are 70. The single most direct evidence that the 1.6-point gap
    // in the means is not a shift in how I rate a film on a plane.
    expect(s.travel.medianRating).toBe(70);
    expect(s.ordinary.medianRating).toBe(70);
    expect(s.travel.medianRating).toBe(s.ordinary.medianRating);
  });

  it("puts zero inside the interval, so the gap is noise", () => {
    expect(s.ratingDiff).toBeCloseTo(-1.5707, 4);
    expect(s.ratingDiffSe).toBeCloseTo(2.7717, 4);
    expect(s.ratingDiffCi[0]).toBeCloseTo(-7.0032, 4);
    expect(s.ratingDiffCi[1]).toBeCloseTo(3.8618, 4);
    // The whole reason `ratingGapIsNoise` exists. The gap is smaller than its own
    // standard error, so the interval spans zero and a chart claiming "I rate
    // flight films worse" would be stating a difference the data does not hold.
    expect(s.ratingDiffCi[0]).toBeLessThan(0);
    expect(s.ratingDiffCi[1]).toBeGreaterThan(0);
    expect(s.ratingGapIsNoise).toBe(true);
    expect(Math.abs(s.ratingDiff)).toBeLessThan(s.ratingDiffSe);
  });

  it("labels the gap with a true minus sign, not a hyphen", () => {
    expect(signedLabel(s.ratingDiff)).toBe("−1.6");
    expect(signedLabel(0)).toBe("0.0");
    expect(signedLabel(2.25)).toBe("+2.3");
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
