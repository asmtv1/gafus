import { describe, expect, it } from "vitest";
import { feedV2PreviewHeight } from "./feedV2PreviewHeight";

describe("Moment video preview height on native phones", () => {
  it("caps a 9:16 video well below the full screen", () => {
    expect(feedV2PreviewHeight({ width: 720, height: 1280 }, 390, 844)).toBe(439);
    expect(feedV2PreviewHeight({ width: 720, height: 1280 }, 390, 650)).toBe(338);
  });
  it("uses a natural wide stage for landscape instead of enlarging it", () => {
    expect(feedV2PreviewHeight({ width: 1920, height: 1080 }, 390, 844)).toBe(219);
  });
  it("keeps square posts smaller than a full device viewport", () => {
    expect(feedV2PreviewHeight({ width: 1080, height: 1080 }, 390, 844)).toBe(390);
  });
  it("handles missing dimensions without overflowing the screen", () => {
    expect(feedV2PreviewHeight({ width: 0, height: 0 }, 390, 700)).toBe(219);
  });
});
