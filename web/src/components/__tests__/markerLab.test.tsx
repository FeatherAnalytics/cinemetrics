import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import dataset from "../../../public/data/cinemetrics.json";
import {
  inkVsDot,
  LEG_ANGLE,
  LEGS,
  pathArea,
  retiredDartPath,
  SIZES,
  TravelMarkerLab,
  sideProfilePath,
  VARIANTS,
} from "@/components/lab/TravelMarkerLab";
import { PlaneMarker, planePath, TRAVEL_DAYS, type TravelLeg } from "@/lib/travel";
import type { Dataset } from "@/lib/types";

const data = dataset as unknown as Dataset;

/** Every coordinate pair in a path's `M x,y L x,y ...` command string. */
function coords(d: string): [number, number][] {
  return (d.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((p) => {
    const [x, y] = p.split(",").map(Number);
    return [x, y] as [number, number];
  });
}

describe("the candidate marker geometry", () => {
  it("gives every candidate a nose on the +x axis at exactly r", () => {
    // The rotation in `Mark` assumes the nose points along +x, the same
    // assumption `planePath` makes. A candidate whose nose sat anywhere else
    // would silently point the wrong way at every leg angle.
    for (const [name, path] of [
      ["retired dart", retiredDartPath],
      ["shipping top-down", planePath],
      ["side profile", sideProfilePath],
    ] as const) {
      const first = coords(path(0, 0, 10))[0];
      expect(first[0], `${name} nose x`).toBeCloseTo(10, 5);
      expect(first[1], `${name} nose y`).toBeCloseTo(0, 1);
    }
  });

  it("scales linearly with r and translates with the center", () => {
    for (const path of [retiredDartPath, planePath, sideProfilePath]) {
      const at1 = coords(path(0, 0, 1));
      const at6 = coords(path(0, 0, 6));
      expect(at6.length).toBe(at1.length);
      for (let i = 0; i < at1.length; i++) {
        expect(at6[i][0]).toBeCloseTo(at1[i][0] * 6, 1);
        expect(at6[i][1]).toBeCloseTo(at1[i][1] * 6, 1);
      }
      const moved = coords(path(100, 50, 6));
      for (let i = 0; i < at6.length; i++) {
        expect(moved[i][0]).toBeCloseTo(at6[i][0] + 100, 1);
        expect(moved[i][1]).toBeCloseTo(at6[i][1] + 50, 1);
      }
    }
  });

  it("keeps every candidate within a whisker of the r it claims", () => {
    // 1.03r, not r. `r` is documented as nose to CENTER and is not a bounding
    // radius: the shipping dart's own wingtips sit at 1.022r. The grid lays its
    // cells out on r, so the bound that matters is "no tip far enough out to
    // overlap the next size column and make the size comparison show something
    // other than size".
    const BOUND = 10 * 1.03;
    for (const [name, path] of [
      ["retired dart", retiredDartPath],
      ["shipping top-down", planePath],
      ["side profile", sideProfilePath],
    ] as const) {
      const worst = Math.max(...coords(path(0, 0, 10)).map(([x, y]) => Math.hypot(x, y)));
      expect(worst, `${name} furthest point`).toBeLessThanOrEqual(BOUND);
    }
  });

  it("builds the top-down silhouette symmetric about its own axis", () => {
    // The claim made on the page: the top-down view is the only candidate the leg
    // angle merely tilts, because its outline is mirror-symmetric.
    const pts = coords(planePath(0, 0, 10));
    const ys = pts.map(([, y]) => y).sort((a, b) => a - b);
    for (let i = 0; i < ys.length; i++) {
      expect(ys[i]).toBeCloseTo(-ys[ys.length - 1 - i], 5);
    }
  });

  it("builds the side profile ASYMMETRIC, which is the whole point of it", () => {
    // Fin up, wing down. If this ever became symmetric it would have collapsed
    // into the top-down view and there would be two candidates, not three.
    const pts = coords(sideProfilePath(0, 0, 10));
    const top = Math.min(...pts.map(([, y]) => y));
    const bottom = Math.max(...pts.map(([, y]) => y));
    expect(Math.abs(top)).not.toBeCloseTo(bottom, 1);
  });

  it("keeps the silhouettes more detailed than the dart, as their labels claim", () => {
    const counts = {
      dart: coords(retiredDartPath(0, 0, 10)).length,
      "top-down": coords(planePath(0, 0, 10)).length,
      side: coords(sideProfilePath(0, 0, 10)).length,
    };
    expect(counts.dart).toBe(4);
    // The page prints a point count per variant. Asserted so the label cannot
    // drift away from the shape it describes.
    for (const v of VARIANTS) {
      // `path: null` is the shipping row, which draws through PlaneMarker.
      const actual =
        v.path == null ? counts["top-down"] : coords(v.path(0, 0, 10)).length;
      expect(actual, v.label).toBe(v.points);
    }
    expect(counts["top-down"]).toBeGreaterThan(counts.dart);
    expect(counts.side).toBeGreaterThan(counts.dart);
  });
});

describe("the measured visual weight", () => {
  it("computes a shoelace area that matches a shape of known size", () => {
    // A unit square through the same path plumbing the candidates use.
    expect(pathArea("M0.00,0.00L4.00,0.00L4.00,4.00L0.00,4.00Z")).toBeCloseTo(16, 6);
  });

  it("finds every candidate LIGHTER than the dot it would replace, at r 5", () => {
    // The finding this section exists to surface, and the opposite of the received
    // complaint about the dart. Pinned so a future shape change that quietly makes
    // the mark heavier than a dot cannot pass while the page still says otherwise.
    for (const v of VARIANTS) {
      const ratio = inkVsDot(v, 5);
      expect(ratio, `${v.label} at r 5`).toBeLessThan(1);
      expect(ratio, `${v.label} at r 5`).toBeGreaterThan(0.4);
    }
    expect(inkVsDot(VARIANTS[0], 5)).toBeCloseTo(0.57, 2);
  });

  it("crosses the dot's ink somewhere above the shipping size", () => {
    // Which is the argument for not growing the mark: r 5 is under a dot, r 7 is
    // over it. The size question and the shape question are separable, and this
    // is the number that separates them.
    const dart = VARIANTS[0];
    expect(inkVsDot(dart, 5)).toBeLessThan(1);
    expect(inkVsDot(dart, 7)).toBeGreaterThan(1);
  });
});

describe("the lab's copy of the leg angles", () => {
  it("holds exactly the angles PlaneMarker rotates by", () => {
    // `LEG_ANGLE` is private to lib/travel and this section may not edit that
    // file, so the lab keeps a second copy. This is the pin that stops the two
    // drifting.
    //
    // Compared against the value PlaneMarker RENDERS, not against a literal, and
    // asserted on the lab's exported map rather than on any rendered candidate.
    // An earlier version of this test searched the rendered output for "some path
    // rotated by -35" and was worthless: the dart variant draws through the real
    // PlaneMarker, so it satisfied that search no matter what the lab's own copy
    // said, and a drift of the copy went green.
    for (const leg of LEGS) {
      const { container } = render(
        <svg>
          <PlaneMarker x={0} y={0} leg={leg} />
        </svg>,
      );
      const shipped = Number(
        container.querySelector("path")!.getAttribute("transform")!.match(/-?[\d.]+/)![0],
      );
      expect(LEG_ANGLE[leg], leg).toBe(shipped);
    }
  });

  it("actually applies its own angles to the silhouettes", () => {
    // The other half of the pin. The map being right is no use if a candidate
    // ignores it.
    const { container } = render(<TravelMarkerLab data={data} />);
    const silhouette = container.querySelector('[data-strip="top-down"]')!;
    const angles = new Set(
      [...silhouette.querySelectorAll("path[transform]")].map(
        (p) => p.getAttribute("transform")!.match(/-?[\d.]+/)![0],
      ),
    );
    for (const leg of LEGS) {
      // Every leg present in the travel data must appear as its own rotation.
      expect(angles.has(String(LEG_ANGLE[leg])), `${leg} at ${LEG_ANGLE[leg]}`).toBe(true);
    }
  });
});

describe("the rendered comparison", () => {
  it("draws every variant at every size and every leg, with a dot for scale", () => {
    const { container } = render(<TravelMarkerLab data={data} />);
    const grid = container.querySelector("table")!;
    const cells = grid.querySelectorAll("tbody td svg");
    expect(cells.length).toBe(VARIANTS.length * SIZES.length);
    for (const cell of cells) {
      // Three legs plus the r 3.5 reference dot in every single cell.
      expect(cell.querySelectorAll("path").length).toBe(LEGS.length);
      const dot = cell.querySelector("circle")!;
      expect(dot.getAttribute("r")).toBe("3.5");
    }
  });

  it("draws the grid at 1:1 with no viewBox, so r means pixels", () => {
    // The page promises true size. A viewBox on these cells would scale the marks
    // and make "r 5" mean whatever the column happened to be wide.
    const { container } = render(<TravelMarkerLab data={data} />);
    for (const svg of container.querySelectorAll("table svg")) {
      expect(svg.getAttribute("viewBox")).toBeNull();
      expect(svg.getAttribute("width")).toBeTruthy();
    }
  });

  it("puts all 21 flights in each context strip, over the real field of dots", () => {
    const travelWatches = data.watches.filter((w) => TRAVEL_DAYS[w.date]).length;
    expect(travelWatches).toBe(21);

    const { container } = render(<TravelMarkerLab data={data} />);
    const strips = [...container.querySelectorAll("svg[data-strip]")];
    expect(strips.length).toBe(VARIANTS.length);

    const inYears = data.watches.filter((w) =>
      [2019, 2021, 2023].includes(Number(w.date.slice(0, 4))),
    ).length;
    for (const strip of strips) {
      // Dots are the non-travel watches of those three years, marks are the 21.
      expect(strip.querySelectorAll("circle").length).toBe(inYears - travelWatches);
      expect(strip.querySelectorAll("path").length).toBe(travelWatches);
    }
  });

  it("colors the context marks by genre, never in flat ink", () => {
    // The dart draws in the film's genre color in production (36bb896), so a
    // comparison in ink would be judging a mark that no longer ships.
    const { container } = render(<TravelMarkerLab data={data} />);
    const strip = container.querySelector('svg[data-strip="dart"]')!;
    const fills = new Set(
      [...strip.querySelectorAll("path")].map((p) => p.getAttribute("fill")),
    );
    expect(fills.size).toBeGreaterThan(1);
    // #0b0b0b and #f2f0ea are ink.primary in the two themes.
    expect(fills.has("#0b0b0b")).toBe(false);
    expect(fills.has("#f2f0ea")).toBe(false);
  });

  it("holds the shipping size in the set under review", () => {
    // PlaneMarker's default. A comparison that omitted it would be comparing
    // three sizes none of which is the one on the site.
    expect(SIZES).toContain(5);
  });
});

describe("the section leaves production alone", () => {
  it("points `path: null` at whatever currently ships, and only at that", () => {
    // `path: null` means "use the real PlaneMarker". Exactly one row may carry it,
    // and it has to be the row labelled as shipping, or the comparison starts
    // measuring a duplicate against the thing it was duplicated from.
    //
    // The pointer moved from the dart to the top-down row when the promotion
    // landed. That move IS the record of the decision, so it is asserted rather
    // than left to the label.
    const shipping = VARIANTS.filter((v) => v.path == null);
    expect(shipping).toHaveLength(1);
    expect(shipping[0].id).toBe("top-down");
    expect(shipping[0].label).toContain("shipping");

    const dart = VARIANTS.find((v) => v.id === "dart")!;
    expect(dart.path).toBe(retiredDartPath);
    expect(dart.label).toContain("retired");
  });

  it("keeps the retired dart's geometry as it was, not as production draws now", () => {
    // The point of still showing it. If this ever equalled `planePath` the page
    // would be comparing the new mark against itself.
    expect(retiredDartPath(0, 0, 5)).not.toBe(planePath(0, 0, 5));
    expect(coords(retiredDartPath(0, 0, 5)).length).toBe(4);
  });

  it("draws the dart candidate identically to the shipping mark", () => {
    const { container } = render(<TravelMarkerLab data={data} />);
    const dartRow = container.querySelectorAll("tbody tr")[0];
    const firstCellPath = dartRow.querySelector("td svg path")!.getAttribute("d");
    // First cell is r 5, first leg is depart, drawn at the cell's first mark slot.
    const legs: TravelLeg[] = LEGS;
    expect(legs[0]).toBe("depart");
    expect(firstCellPath).toBe(retiredDartPath(58, 22, 5));
  });
});
