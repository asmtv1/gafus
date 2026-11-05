import { describe, expect, it } from "vitest";
import { clientWebpRenditionsMatchAspect } from "./clientPhotoRenditions.js";

const image = (width: number, height: number) => ({ width, height });

describe("client photo rendition aspect validation", () => {
  it("accepts the confirmed production regression: 379x131 -> 360x125", () => {
    // Both uploaded WebPs passed HEAD, content-type and full Sharp decode,
    // but the old ratio epsilon wrongly rejected them at confirm.
    const small = image(360, 125), medium = image(379, 131);
    expect(Math.abs(small.width / small.height - medium.width / medium.height))
      .toBeGreaterThan(0.012);
    expect(clientWebpRenditionsMatchAspect(small, medium)).toBe(true);
  });
  it.each([
    [360, 360, 1440, 1440],
    [360, 125, 379, 131],
    [125, 360, 131, 379],
    [360, 313, 892, 774],
    [360, 270, 1440, 1080],
    [225, 360, 900, 1440],
    [1, 360, 1, 1440],
    [360, 1, 1440, 1],
    [250, 180, 250, 180],
  ])("accepts equivalent dimensions (%i,%i) vs (%i,%i)", (sw, sh, mw, mh) => {
    expect(clientWebpRenditionsMatchAspect(image(sw, sh), image(mw, mh))).toBe(true);
  });
  it.each([
    [360, 125, 379, 140],
    [360, 130, 379, 131],
    [360, 360, 1440, 1000],
    [360, 200, 360, 360],
    [360, 125, 359, 131],
    [0, 125, 379, 131],
    [360, 0, 379, 131],
    [360.5, 125, 379, 131],
  ])("rejects mismatched or invalid dimensions (%i,%i) vs (%i,%i)", (sw, sh, mw, mh) => {
    expect(clientWebpRenditionsMatchAspect(image(sw, sh), image(mw, mh))).toBe(false);
  });
});
