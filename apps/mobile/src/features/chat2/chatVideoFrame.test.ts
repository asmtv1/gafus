import { describe, expect, it } from "vitest";
import { chatVideoFrameHeight } from "./chatVideoFrame";

describe("Chat2 video frame aspect ratio", () => {
  it("shows portrait video vertically, square as square and landscape wider than tall", () => {
    expect(chatVideoFrameHeight(220, 720, 1280)).toBe(360);
    expect(chatVideoFrameHeight(220, 720, 720)).toBe(220);
    expect(chatVideoFrameHeight(220, 1280, 720)).toBe(160);
    expect(chatVideoFrameHeight(220, 1080, 1920)).toBe(360);
  });
  it("bounds unknown and invalid track metadata safely", () => {
    expect(chatVideoFrameHeight(220)).toBe(220);
    expect(chatVideoFrameHeight(220, 0, 0)).toBe(220);
    expect(chatVideoFrameHeight(220, 2, 10000)).toBe(360);
  });
});
