import { describe, expect, it } from "vitest";
import { nextChatTab, shouldCloseSheet, shouldReplyToSwipe } from "./swipePolicy";

describe("safe mobile swipe policies", () => {
  it("closes sheets on a deliberate downward gesture, never on accidental or upward drags", () => {
    expect(shouldCloseSheet(91, 0)).toBe(true);
    expect(shouldCloseSheet(45, 950)).toBe(true);
    expect(shouldCloseSheet(35, 1200)).toBe(false);
    expect(shouldCloseSheet(-180, -1500)).toBe(false);
    expect(shouldCloseSheet(50, 80)).toBe(false);
  });
  it("moves only one chat category at a time, bounded by the first and last tabs", () => {
    expect(nextChatTab("all", -110, 10)).toBe("direct");
    expect(nextChatTab("direct", -110, 0)).toBe("group");
    expect(nextChatTab("group", -110, 0)).toBe("unread");
    expect(nextChatTab("unread", -110, 0)).toBe("unread");
    expect(nextChatTab("all", 110, 0)).toBe("all");
    expect(nextChatTab("group", 130, 0)).toBe("direct");
    expect(nextChatTab("group", -100, 250)).toBe("group");
    expect(nextChatTab("direct", 10, 1)).toBe("direct");
  });
  it("never sends a reply from a vertical scroll, left swipe or short gesture", () => {
    expect(shouldReplyToSwipe(110, 4, 100)).toBe(true);
    expect(shouldReplyToSwipe(80, 3, 200)).toBe(false);
    expect(shouldReplyToSwipe(-110, 3, -200)).toBe(false);
    expect(shouldReplyToSwipe(110, 90, 200)).toBe(false);
    expect(shouldReplyToSwipe(110, 3, -1000)).toBe(false);
  });
});
