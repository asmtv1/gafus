import { describe, expect, it } from "vitest";
import { shouldDismissMediaSwipe } from "./swipeDismissPolicy";

describe("swipe-to-dismiss media threshold", () => {
  it("dismisses after a sufficiently long downward drag", () => {
    expect(shouldDismissMediaSwipe(116, 0)).toBe(true);
    expect(shouldDismissMediaSwipe(116, 150)).toBe(true);
  });
  it("dismisses after a decisive downward flick", () => {
    expect(shouldDismissMediaSwipe(51, 901)).toBe(true);
  });
  it("ignores upward and short, slow swipes to preserve other gestures", () => {
    expect(shouldDismissMediaSwipe(-180, -1700)).toBe(false);
    expect(shouldDismissMediaSwipe(40, 1600)).toBe(false);
    expect(shouldDismissMediaSwipe(80, 80)).toBe(false);
    expect(shouldDismissMediaSwipe(0, 0)).toBe(false);
  });
});
