import { describe, expect, it, vi } from "vitest";
import { signFeedMediaUrls, type FeedMediaUrlKeys } from "./media-urls";
const id = "asset123";
const prefix = `media/v2/${id}/v1/`;
const photo: FeedMediaUrlKeys = {
  id, kind: "photo", smallKey: prefix + "image/s.webp",
  thumbKey: prefix + "image/m.webp", fullKey: prefix + "image/l.webp",
  posterKey: null, mp4Keys: [],
};
const sign = vi.fn(async key => `https://local-cdn.test/${key}`);
describe("one canonical Moments media URL signing", () => {
  it("returns all three WebP sizes of the same media without independent tickets", async () => {
    sign.mockClear();
    const result = await signFeedMediaUrls(photo, sign);
    expect(result.smallUrl).toContain("/image/s.webp");
    expect(result.thumbUrl).toContain("/image/m.webp");
    expect(result.fullUrl).toContain("/image/l.webp");
    expect(result.mp4Urls).toBeNull();
    expect(sign).toHaveBeenCalledTimes(3);
  });
  it("ignores preserved older WORK-DB keys without re-enabling HLS or returning 500", async () => {
    sign.mockClear();
    const result = await signFeedMediaUrls({ ...photo, smallKey: null,
      thumbKey: "posts/owner/post/attachments/asset123/thumb.webp",
      fullKey: "posts/owner/post/attachments/asset123/full.webp" }, sign);
    expect(result.smallUrl).toBeNull();
    expect(result.thumbUrl).toBeNull();
    expect(result.fullUrl).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });
  it("never signs a foreign asset or a variant with another type", async () => {
    sign.mockClear();
    const result = await signFeedMediaUrls({ ...photo,
      fullKey: "media/v2/other/v1/image/l.webp",
      thumbKey: prefix + "video/360.mp4" }, sign);
    expect(result.thumbUrl).toBeNull();
    expect(result.fullUrl).toBeNull();
    expect(sign).toHaveBeenCalledOnce();
  });
  it("signs only progressive MP4 360/720/1080 with WebP poster", async () => {
    sign.mockClear();
    const result = await signFeedMediaUrls({ ...photo, kind: "video",
      posterKey: prefix + "poster.webp",
      mp4Keys: [prefix + "video/360.mp4", prefix + "video/720.mp4",
        prefix + "hls/playlist.m3u8", "media/v2/other/v1/video/1080.mp4"] }, sign);
    expect(result.mp4Urls).toEqual({
      360: `https://local-cdn.test/${prefix}video/360.mp4`,
      720: `https://local-cdn.test/${prefix}video/720.mp4`,
    });
    expect(result.posterUrl).toContain("poster.webp");
    expect(sign).toHaveBeenCalledTimes(3);
  });
  it("does not expose MP4 higher renditions if 360p or poster are absent", async () => {
    sign.mockClear();
    const result = await signFeedMediaUrls({ ...photo, kind: "video",
      posterKey: prefix + "poster.webp", mp4Keys: [prefix + "video/720.mp4"] }, sign);
    expect(result.mp4Urls).toBeNull();
    expect(result.posterUrl).toBeNull();
  });
});
