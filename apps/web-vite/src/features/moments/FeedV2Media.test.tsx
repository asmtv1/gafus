// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedV2ImageMedia, FeedV2VideoMedia } from "@gafus/types";
import { FeedV2Image, feedV2VariantWidth } from "./FeedV2Image";
import { FeedV2Video } from "./FeedV2Video";
const base = { id: "a", status: "ready", width: 640, height: 360, access: "public", expiresAt: null, placeholder: null } as const;
const photo: FeedV2ImageMedia = { ...base, kind: "image", urls: { small: "/media/v2/a/v1/image/s.webp", medium: "/media/v2/a/v1/image/m.webp", large: "/media/v2/a/v1/image/l.webp" } };
const movie: FeedV2VideoMedia = { ...base, kind: "video", durationSeconds: 12, posterUrl: "/media/v2/a/v1/poster.webp", mp4: { 360: "/media/v2/a/v1/video/360.mp4" } };
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });
describe("Web Feed V2 native rendering", () => {
  it("server markup includes visible WebP and never eager-downloads large", () => {
    const html = renderToStaticMarkup(createElement(FeedV2Image, {
      media: photo, firstVisible: true,
    }));
    expect(html).toContain("image/m.webp");
    expect(html).toContain("image/s.webp");
    expect(html).toContain('fetchPriority="high"');
    expect(html).not.toContain("image/l.webp");
  });
  it("describes portrait WebP rendition width rather than the longer edge", () => {
    expect(feedV2VariantWidth(1200, 2400, 360)).toBe(180);
    expect(feedV2VariantWidth(1200, 2400, 720)).toBe(360);
    const html = renderToStaticMarkup(createElement(FeedV2Image, {
      media: { ...photo, width: 1200, height: 2400 },
    }));
    expect(html).toContain("180w");
    expect(html).toContain("360w");
    expect(html).not.toContain("720w");
  });
  it("opens a portal viewer with a fixed round close icon and no image alt-text flash", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host=document.createElement("div"); document.body.append(host);
    const root=createRoot(host);
    await act(async () => root.render(createElement(FeedV2Image, { media:photo, alt:"Подпись к фото" })));
    try {
      await act(async () => host.querySelector<HTMLButtonElement>(".feed-v2-image-open")?.click());
      expect(host.querySelector(".feed-v2-lightbox")).toBeNull();
      const viewer=document.body.querySelector(".feed-v2-lightbox");
      expect(viewer).not.toBeNull();
      expect(document.body.style.overflow).toBe("hidden");
      expect(viewer?.querySelector('button[aria-label="Закрыть просмотр фотографии"] svg')).not.toBeNull();
      expect(viewer?.querySelector('[role="status"][aria-label="Загружаем фотографию"]')).not.toBeNull();
      const full=viewer?.querySelector<HTMLImageElement>(".feed-v2-lightbox-image");
      expect(full?.getAttribute("src")).toBe(photo.urls.large);
      expect(full?.classList.contains("is-loaded")).toBe(false);
      await act(async () => { full?.dispatchEvent(new Event("load")); });
      expect(full?.classList.contains("is-loaded")).toBe(true);
      expect(viewer?.querySelector('[role="status"]')).toBeNull();
      await act(async () => {
        viewer?.querySelector<HTMLButtonElement>(".feed-v2-lightbox-close")?.click();
      });
      expect(document.querySelector(".feed-v2-lightbox")).toBeNull();
      expect(document.body.style.overflow).toBe("");
      expect(document.activeElement).toBe(host.querySelector(".feed-v2-image-open"));
    } finally { await act(async () => root.unmount()); }
  });
  it("shows a loading state instead of broken image text and closes with Escape", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host=document.createElement("div"); document.body.append(host);
    const root=createRoot(host);
    await act(async () => root.render(createElement(FeedV2Image, { media:photo })));
    try {
      await act(async () => host.querySelector<HTMLButtonElement>(".feed-v2-image-open")?.click());
      const full=document.querySelector<HTMLImageElement>(".feed-v2-lightbox-image");
      await act(async () => { full?.dispatchEvent(new Event("error")); });
      expect(document.querySelector(".feed-v2-lightbox-error")?.textContent).toContain("Не удалось загрузить");
      expect(full?.classList.contains("is-loaded")).toBe(false);
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true})));
      expect(document.querySelector(".feed-v2-lightbox")).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
  it("does not request playback ticket and leaves MP4 unloaded until click", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(FeedV2Video, { media: movie })));
    try {
      expect(host.querySelector("video")?.hasAttribute("src")).toBe(false);
      expect(host.querySelector("video")?.preload).toBe("none");
      await act(async () => { host.querySelector("button")?.click(); });
      expect(play).toHaveBeenCalledTimes(1);
      expect(host.querySelector("video")?.getAttribute("src")).toBe(movie.mp4[360]);
    } finally { await act(async () => root.unmount()); }
  });
});
