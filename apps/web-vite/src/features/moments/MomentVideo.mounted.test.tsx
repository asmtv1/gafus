// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentVideo } from "./MomentVideo";
import { MomentMediaGallery } from "./MomentMediaGallery";

const mp4 = "https://cdn.example.test/media/v2/video_01/v1/video/360.mp4?sig=signed";
const poster = "https://cdn.example.test/media/v2/video_01/v1/poster.webp?sig=signed";
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });
describe("Moments direct WebP/MP4 cutover", () => {
  it("shows poster without requesting a playback ticket", async () => {
    const html = createElement(MomentVideo, { mediaId: "video_01", poster,
      mp4Urls: { 360: mp4 }, width: 1280, height: 720 });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(html));
    try {
      // The new shared Feed CDN image component owns the poster; native video
      // `poster=` cannot recover on CDN failure. Do not mutate the in-flight UI.
      expect(host.querySelector("video")?.hasAttribute("poster")).toBe(false);
      expect(host.querySelector(".feed-v2-video-poster img")?.getAttribute("src")).toBe(poster);
      expect(host.querySelector("video")?.hasAttribute("src")).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      await act(async () => { host.querySelector('button[aria-label="Воспроизвести видео"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })); });
      expect(host.querySelector("video")?.getAttribute("src")).toBe(mp4);
      expect(play).toHaveBeenCalledOnce();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
  });
  it("renders media using signed URLs from the listing without an extra API request", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(MomentMediaGallery, {
      postId: "post1", count: 1, autoLoad: true,
      initialMedia: [{ id: "video_01", kind: "video", url: poster,
        mp4Urls: { 360: mp4 }, width: 1280, height: 720 }],
    })));
    try {
      expect(host.querySelector('button[aria-label="Воспроизвести видео"]')).not.toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
  });
});
