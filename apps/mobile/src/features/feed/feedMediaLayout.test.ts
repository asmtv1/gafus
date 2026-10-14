import { describe, expect, it } from "vitest";
import { getFeedPreviewHeight } from "./feedMediaLayout";

describe("getFeedPreviewHeight", () => {
  it("uses photo proportions for ordinary landscape photos", () => {
    expect(getFeedPreviewHeight(360, 1200, 900, 900)).toBe(270);
  });

  it("allows a taller portrait preview instead of the old 218px crop", () => {
    expect(getFeedPreviewHeight(360, 900, 1200, 900)).toBe(440);
  });

  it("bounds tall and panoramic images to usable mobile card heights", () => {
    expect(getFeedPreviewHeight(360, 500, 2000, 600)).toBe(348);
    expect(getFeedPreviewHeight(360, 2000, 500, 900)).toBe(160);
  });

  it("uses a safe 4:3 fallback for missing or invalid metadata", () => {
    expect(getFeedPreviewHeight(320, undefined, undefined, 900)).toBe(240);
    expect(getFeedPreviewHeight(320, 0, -1, 900)).toBe(240);
  });
});
