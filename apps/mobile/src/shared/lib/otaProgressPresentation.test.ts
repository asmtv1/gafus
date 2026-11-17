import { describe, expect, it } from "vitest";
import { getRequiredOtaProgressPresentation as present } from "./otaProgressPresentation";

describe("mandatory OTA download phases", () => {
  it("shows real progress while resources are downloading", () => {
    expect(present("downloading", 0)).toEqual({ percent: 0, finishing: false });
    expect(present("downloading", 0.51)).toEqual({ percent: 51, finishing: false });
    expect(present("downloading", 0.979)).toEqual({ percent: 97, finishing: false });
  });
  it("switches to an indeterminate finishing state instead of a stuck 99%", () => {
    for (const progress of [0.98, 0.99, 1, 1.5]) {
      expect(present("downloading", progress)).toEqual({ percent: null, finishing: true });
    }
  });
  it("never displays a misleading numeric percent before or after the download", () => {
    for (const phase of ["checking", "installing", "error"] as const) {
      expect(present(phase, 0.99)).toEqual({ percent: null, finishing: false });
    }
    for (const bad of [undefined, null, NaN, Infinity, -Infinity]) {
      expect(present("downloading", bad)).toEqual({ percent: null, finishing: false });
    }
  });
});
