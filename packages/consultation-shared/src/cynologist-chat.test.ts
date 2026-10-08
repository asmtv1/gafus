import { describe, expect, it } from "vitest";
import { CHAT_LIMITS, ownChatMessageActions } from "./cynologist-chat";
const now = Date.parse("2026-10-06T12:00:00Z");
const message = {
  id: "message",
  authorId: "owner",
  type: "regular",
  createdAt: new Date(now - 1000),
};
describe("own message policy", () => {
  it("allows editing and deletion of a recent own message", () => {
    expect(ownChatMessageActions(message, "owner", now)).toEqual({
      canEdit: true,
      canDelete: true,
    });
  });
  it("expires editing at 15 minutes and deletion at 24 hours", () => {
    expect(
      ownChatMessageActions(
        { ...message, createdAt: new Date(now - CHAT_LIMITS.editWindowMs) },
        "owner",
        now,
      ),
    ).toEqual({ canEdit: false, canDelete: true });
    expect(
      ownChatMessageActions(
        { ...message, createdAt: new Date(now - CHAT_LIMITS.deleteWindowMs) },
        "owner",
        now,
      ),
    ).toEqual({ canEdit: false, canDelete: false });
  });
  it.each([
    { authorId: "other" },
    { id: "intake-owner" },
    { type: "system" },
    { type: "deleted" },
    { deletedAt: new Date(now) },
    { createdAt: "invalid" },
    { createdAt: new Date(now + 1) },
  ])("hides actions for unavailable messages %j", (override) => {
    expect(ownChatMessageActions({ ...message, ...override }, "owner", now)).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });
});
