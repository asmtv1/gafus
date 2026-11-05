import { describe, expect, it } from "vitest";
import { selectFeedV2VideoUrl, validateFeedV2DeliveryUrl, type FeedV2VideoMedia } from "./feed-v2";
const video: FeedV2VideoMedia = { id: "a", kind: "video", status: "ready", width: 1920, height: 1080,
  access: "viewer", expiresAt: "2026-10-27T00:00:00Z", placeholder: null,
  durationSeconds: 60, posterUrl: "/media/v2/a/v1/poster.webp", mp4: { 360: "360.mp4", 720: "720.mp4" } };
describe("Feed V2 shared media contract", () => {
  it("selects a ready MP4 without requesting a playback token", () => {
    expect(selectFeedV2VideoUrl(video, { viewportWidth: 360, preference: "save-data" })).toBe("360.mp4");
    expect(selectFeedV2VideoUrl(video, { viewportWidth: 600 })).toBe("720.mp4");
    expect(selectFeedV2VideoUrl(video, { viewportWidth: 1080 })).toBe("720.mp4");
    expect(selectFeedV2VideoUrl({ ...video, mp4: { 360: "only.mp4" } }, { viewportWidth: 1800 })).toBe("only.mp4");
    const early={...video,mp4:{720:"ready-720.mp4"}};
    expect(selectFeedV2VideoUrl(early,{viewportWidth:320,preference:"save-data"})).toBe("ready-720.mp4");
    expect(selectFeedV2VideoUrl(early,{viewportWidth:1800})).toBe("ready-720.mp4");
    expect(() => selectFeedV2VideoUrl({...video,mp4:{}},{viewportWidth:320})).toThrow("FEED_VIDEO_NO_READY_MP4");
  });
  it("accepts only versioned media URLs from one canonical origin", () => {
    const origin = "https://media.example.test";
    expect(validateFeedV2DeliveryUrl("/media/v2/a/v1/video/360.mp4", origin)).toBe(`${origin}/media/v2/a/v1/video/360.mp4`);
    for (const url of ["https://other.test/media/v2/a/v1/video/360.mp4", "https://s3.cloud.ru/private.mp4", "/media/v2/a/../b/v1/poster.webp", "/media/v2/a/v1/video/360.ts", "/media/v2/a/v1/video/1080.mp4", "//evil.test/media/v2/a/v1/poster.webp"]) {
      expect(() => validateFeedV2DeliveryUrl(url, origin), `Invalid URL: ${url}`).toThrow();
    }
  });
});
