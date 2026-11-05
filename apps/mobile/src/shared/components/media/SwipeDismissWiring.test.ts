import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const feedViewer = read("../../../features/feed/FeedMediaViewer.tsx");
const feedInline = read("../../../features/feed/FeedV2Media.tsx");
const socialControls = read("./SocialVideoControls.tsx");
const chat = read("../../../features/chat2/Chat2RoomScreen.tsx");
const questions = read("../../../features/questions/ui.tsx");
const training = read("../../../features/training/components/AccordionStep.tsx");
const gallery = read("../../../features/gallery/viewer.tsx");

describe("Mobile fullscreen media swipe coverage", () => {
  it("mounts gesture handlers inside the moments, chat, questions and training modals", () => {
    for (const viewer of [feedViewer, feedInline, chat, questions, training]) {
      expect(viewer).toContain("<GestureHandlerRootView");
      expect(viewer).toContain("<SwipeDismissMedia");
      expect(viewer).toContain("onDismiss=");
    }
  });
  it("preserves native horizontal paging in moments, questions, courses and albums", () => {
    for (const viewer of [feedViewer, questions, training, gallery]) {
      expect(viewer).toContain("horizontal");
      expect(viewer).toContain("pagingEnabled");
    }
    expect(gallery).toContain(".failOffsetX([-24, 24])");
  });
  it("uses a custom dismissable fullscreen for moments video without another MP4 player", () => {
    expect(feedInline).toContain('onExpand={fullscreen ? undefined : () => setExpanded(true)}');
    expect(socialControls).toContain('accessibilityLabel="Развернуть видео"');
    expect(feedInline).toContain('accessibilityLabel="Закрыть видео"');
    expect(feedInline).toContain("<SwipeDismissMedia onDismiss={() => setExpanded(false)}>");
    expect(feedInline).toContain("<VideoView player={player} style={s.expandedVideo}");
  });
});
