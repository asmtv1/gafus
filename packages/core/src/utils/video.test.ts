import { describe, expect, it } from "vitest";

import { getEmbeddedVideoInfo } from "./video";

describe("getEmbeddedVideoInfo", () => {
  it("returns empty for null", () => {
    expect(getEmbeddedVideoInfo(null)).toEqual({
      embedUrl: "",
      isShorts: false,
    });
  });

  it("handles offline HLS URL", () => {
    const result = getEmbeddedVideoInfo("/offline-hls/manifest.m3u8");
    expect(result.isHLS).toBe(true);
    expect(result.isCDN).toBe(false);
    expect(result.embedUrl).toBe("/offline-hls/manifest.m3u8");
  });

  it("handles blob URL", () => {
    const result = getEmbeddedVideoInfo("blob:https://example.com/abc");
    expect(result.isCDN).toBe(true);
    expect(result.isHLS).toBe(true);
  });

  it("handles API manifest URL", () => {
    const result = getEmbeddedVideoInfo("/api/video/abc/manifest");
    expect(result.isHLS).toBe(true);
    expect(result.isCDN).toBe(false);
  });

  it("handles CDN URL", () => {
    const result = getEmbeddedVideoInfo(
      "https://gafus-media.storage.yandexcloud.net/video.mp4",
    );
    expect(result.isCDN).toBe(true);
    expect(result.isHLS).toBe(false);
  });

  it("handles CDN HLS URL", () => {
    const result = getEmbeddedVideoInfo(
      "https://storage.yandexcloud.net/gafus-media/video.m3u8",
    );
    expect(result.isCDN).toBe(true);
    expect(result.isHLS).toBe(true);
  });

  it("handles YouTube watch URL", () => {
    const result = getEmbeddedVideoInfo(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.embedUrl).toContain("/embed/dQw4w9WgXcQ");
    expect(result.isShorts).toBe(false);
  });

  it("handles YouTube Shorts", () => {
    const result = getEmbeddedVideoInfo(
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    );
    expect(result.isShorts).toBe(true);
    expect(result.embedUrl).toContain("/embed/dQw4w9WgXcQ");
  });

  it("handles RuTube URL", () => {
    const result = getEmbeddedVideoInfo("https://rutube.ru/video/abc123/");
    expect(result.embedUrl).toContain("/play/embed/abc123");
  });

  it("handles VK video URL", () => {
    const result = getEmbeddedVideoInfo(
      "https://vk.com/video-123456789_456789012",
    );
    expect(result.embedUrl).toContain("video_ext.php");
    expect(result.embedUrl).toContain("oid=-123456789");
  });

  it("handles VK video with z parameter", () => {
    const result = getEmbeddedVideoInfo(
      "https://vk.com/video?z=video-123456789_456789012",
    );
    expect(result.embedUrl).toContain("video_ext.php");
    expect(result.embedUrl).toContain("oid=-123456789");
  });

  it("handles VK video via vkvideo.ru", () => {
    const result = getEmbeddedVideoInfo(
      "https://vkvideo.ru/video13432143_456239219",
    );
    expect(result.embedUrl).toContain("video_ext.php");
  });

  it("handles Vimeo URL", () => {
    const result = getEmbeddedVideoInfo("https://vimeo.com/123456");
    expect(result.embedUrl).toBe("https://player.vimeo.com/video/123456");
  });

  it("passes through unknown URL", () => {
    const url = "https://unknown.com/video";
    const result = getEmbeddedVideoInfo(url);
    expect(result.embedUrl).toBe(url);
    expect(result.isShorts).toBe(false);
  });
});
