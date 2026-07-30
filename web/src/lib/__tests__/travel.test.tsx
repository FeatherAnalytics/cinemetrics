import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import { PlaneMarker, planePath, TRAVEL_DAYS, travelLeg, type TravelLeg } from "../travel";
import type { Dataset } from "../types";

const data = dataset as unknown as Dataset;

/** How many watches the shipped log records on each date. */
const perDay = new Map<string, number>();
for (const w of data.watches) perDay.set(w.date, (perDay.get(w.date) ?? 0) + 1);

/**
 * The flights as the owner supplied them, with the watch count each was verified
 * against before `TRAVEL_DAYS` was written.
 *
 * Held here and not in the module because it is the CHECK, not the data: pinning
 * the count is what turns a mistyped date into a failure. Existence alone is too
 * weak to catch a transposed digit, since most days in 2019 hold a watch already
 * (2021-12-30 does, so a slip from 2021-12-03 would pass an existence test).
 */
const VERIFIED_WATCHES: Record<string, number> = {
  "2019-09-18": 4,
  "2019-09-23": 1,
  "2019-09-24": 2,
  "2019-10-13": 2,
  "2019-10-18": 2,
  "2019-10-21": 3,
  "2021-12-03": 1,
  "2021-12-10": 2,
  "2023-10-03": 1,
  "2023-10-10": 3,
};

describe("the curated travel days against the shipped watch log", () => {
  it("marks exactly the dates that were verified, and no others", () => {
    expect(Object.keys(TRAVEL_DAYS).sort()).toEqual(Object.keys(VERIFIED_WATCHES).sort());
  });

  it("holds the watch count each travel day was verified against", () => {
    // The reason this test is worth having: `TRAVEL_DAYS` is hand-entered, and a
    // mistyped date marks the wrong films or nothing at all. Nothing else in the
    // app would say so.
    for (const [date, n] of Object.entries(VERIFIED_WATCHES)) {
      expect(perDay.get(date) ?? 0, `${date}`).toBe(n);
    }
  });

  it("keeps the two undirected trips exactly a week apart", () => {
    // The 2019 legs were given with directions. These two pairs were not, and the
    // seven-day gap is the whole basis for calling the first outbound and the
    // second the return. If that gap ever stops holding, the assumption in
    // `TRAVEL_DAYS` needs re-checking rather than quietly carrying on.
    for (const [out, home] of [
      ["2021-12-03", "2021-12-10"],
      ["2023-10-03", "2023-10-10"],
    ]) {
      expect(TRAVEL_DAYS[out]).toBe("depart");
      expect(TRAVEL_DAYS[home]).toBe("return");
      const days = (Date.parse(home) - Date.parse(out)) / 86_400_000;
      expect(days, `${out} to ${home}`).toBe(7);
    }
  });

  it("leaves out 2019-10-20, which the log has no watches for", () => {
    // Named as part of an overnight return but empty in the data, so it is
    // deliberately absent. Asserted so a later reader does not "restore" it.
    expect(perDay.get("2019-10-20")).toBeUndefined();
    expect(TRAVEL_DAYS["2019-10-20"]).toBeUndefined();
  });

  it("puts a plane on the busiest viewing day in the data", () => {
    const busiest = Math.max(...perDay.values());
    const largest = [...perDay.entries()].filter(([, n]) => n === busiest).map(([d]) => d);
    // Ties are real: two days sit at the top. The claim is that a flight is among
    // them, not that it is alone there.
    expect(largest.some((d) => TRAVEL_DAYS[d] != null)).toBe(true);
  });

  it("records every leg as one of the three directions", () => {
    const legs: TravelLeg[] = ["depart", "return", "level"];
    for (const [date, leg] of Object.entries(TRAVEL_DAYS)) {
      expect(legs, date).toContain(leg);
    }
  });
});

describe("travelLeg", () => {
  it("answers for any row carrying a date, watch or not", () => {
    expect(travelLeg({ date: "2019-09-18" })).toBe("depart");
    expect(travelLeg({ date: "2019-10-18" })).toBe("level");
    expect(travelLeg({ date: "2021-12-10" })).toBe("return");
  });

  it("returns null for a day spent on the ground", () => {
    expect(travelLeg({ date: "2024-06-20" })).toBeNull();
  });

  it("marks every watch on a travel day, not one of them", () => {
    // The difference from the solstice, which keys on {tmdb_id, date}. 2019-09-18
    // holds four watches and all four are flights.
    const onPeak = data.watches.filter((w) => w.date === "2019-09-18");
    expect(onPeak.length).toBeGreaterThan(1);
    for (const w of onPeak) expect(travelLeg(w)).toBe("depart");
  });
});

describe("PlaneMarker", () => {
  it("draws a four-point dart around the point it is given", () => {
    const d = planePath(100, 50, 5);
    expect(d.match(/L/g)?.length).toBe(3);
    expect(d.startsWith("M105.00,50.00")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("angles the nose up leaving, down returning, and flat mid-trip", () => {
    const rotation = (leg: TravelLeg) => {
      const { container } = render(
        <svg>
          <PlaneMarker x={10} y={20} leg={leg} />
        </svg>,
      );
      return container.querySelector("path")!.getAttribute("transform");
    };
    // SVG rotates clockwise with y pointing down, so a nose-up climb is negative.
    expect(rotation("depart")).toBe("rotate(-35 10 20)");
    expect(rotation("return")).toBe("rotate(35 10 20)");
    expect(rotation("level")).toBe("rotate(0 10 20)");
  });

  it("defaults to the light ink so pure callers see stable output", () => {
    const { container } = render(
      <svg>
        <PlaneMarker x={0} y={0} leg="depart" />
      </svg>,
    );
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("#0b0b0b");
  });
});
