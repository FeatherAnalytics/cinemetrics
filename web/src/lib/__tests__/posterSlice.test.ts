import { describe, expect, it } from "vitest";
import { SLICE_STOPS, sliceStops } from "../posterSlice";

// A real row from transform/seeds/poster_slices.csv (tmdb_id 19), written by
// ingest/poster_slice.py. Pinning a literal keeps these assertions honest: a
// test built only from SLICE_STOPS would agree with a wrong SLICE_STOPS.
const REAL_SLICE =
  "5050507474746565656060603131319191917878783b3b3b3737374848485c5c5c8585853a3a3a2121213a3a3a3232343b392d4a48352424221f1f1f";

describe("sliceStops", () => {
  it("splits a packed slice into one css colour per stop", () => {
    const packed = "ff0000".repeat(SLICE_STOPS);
    expect(sliceStops(packed)).toEqual(Array(SLICE_STOPS).fill("#ff0000"));
  });

  it("returns an empty list for a film with no poster", () => {
    expect(sliceStops(null)).toEqual([]);
    expect(sliceStops("")).toEqual([]);
  });

  it("returns an empty list for a malformed slice rather than drawing garbage", () => {
    expect(sliceStops("abc")).toEqual([]);
  });

  it("agrees with the encoder in ingest/poster_slice.py", () => {
    expect(SLICE_STOPS).toBe(20);
    expect(REAL_SLICE).toHaveLength(120);
  });

  it("decodes a real seed row top of the poster first", () => {
    const stops = sliceStops(REAL_SLICE);
    expect(stops).toHaveLength(20);
    expect(stops[0]).toBe("#505050");
    expect(stops[19]).toBe("#1f1f1f");
  });
});
