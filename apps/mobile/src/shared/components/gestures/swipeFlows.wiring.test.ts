import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const stack = read("../../../../app/(main)/_layout.tsx");
const list = read("../../../features/chat2/Chat2ListScreen.tsx");
const room = read("../../../features/chat2/Chat2RoomScreen.tsx");
const post = read("../../../features/feed/FeedPostActions.tsx");
const photo = read("../../../features/gallery/PhotoActionsMenu.tsx");
const chatSettings = read("../../../features/chat2/Chat2SettingsSheet.tsx");
const report = read("../../../features/chat2/Chat2ReportSheet.tsx");

describe("mobile gesture integration", () => {
  it("uses the native iOS edge back gesture, preserving Android system back", () => {
    expect(stack).toContain('gestureEnabled: Platform.OS === "ios"');
    expect(stack).toContain("fullScreenGestureEnabled: false");
  });
  it("adds a drag handle only to dismissable sheets, never destructive actions", () => {
    for (const source of [post, photo, chatSettings, report, room]) {
      expect(source).toContain("<SwipeDismissHandle");
    }
    expect(report).toContain("disabled={busy || Boolean(comment.trim())}");
    expect(chatSettings).toContain("disabled={busy || unsavedSettings}");
  });
  it("guards chat list mutations by principal and epoch before issuing read/mute", () => {
    expect(list).toContain("binding.authEpoch === epoch");
    expect(list).toContain("if (chatActionFlight.current || !currentActor()) return");
    expect(list).toContain("await chat2.read(room.id, room.lastSequence)");
    expect(list).toContain("await chat2.mute(room.id, !room.muted)");
    expect(list).toContain("<RefreshControl");
    expect(list).toContain("nextChatTab(previous,");
    expect(list).toContain("<Chat2SwipeRow");
  });
  it("refreshes authorized chat photo URL on every gallery change", () => {
    expect(room).toContain("images={imageAttachments}");
    expect(room).toContain("const fresh = await chat2.media(conversationId, targetId)");
    expect(room).toContain("viewerFlight.current !== viewerRequest");
    expect(room).toContain("<Chat2ImageBrowse");
    expect(room).toContain("<SwipeReplyMessage");
  });
});
