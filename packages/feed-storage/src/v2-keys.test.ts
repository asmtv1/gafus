import { describe, expect, it } from "vitest";
import { assertFeedV2FinalKey, feedV2ContentType, feedV2ObjectKey, feedV2OriginKey } from "./v2-keys.js";
describe("Feed V2 immutable object keys", () => {
  it("builds only scoped WebP/MP4 variants", () => {
    const key = feedV2ObjectKey("asset_123", 2, "video/720.mp4");
    expect(key).toBe("media/v2/asset_123/v2/video/720.mp4");
    expect(feedV2OriginKey(`/${key}`)).toBe(key);
    expect(feedV2ContentType(key)).toBe("video/mp4");
    expect(feedV2ContentType(feedV2ObjectKey("abc", 1, "poster.webp"))).toBe("image/webp");
  });
  it("rejects HLS, source keys, traversal and unsafe ids", () => {
    for (const key of ["media/v2/x/v1/video/1080.mp4", "media/v2/x/v1/video/720.m3u8", "media/v2/x/v1/video/segment-01.ts", "media/v2/../v1/poster.webp", "media/v2/x/v0/image/m.webp", "incoming/x/source.mp4", "media/v2/x/v1/../../private.mp4"]) {
      expect(() => assertFeedV2FinalKey(key)).toThrow();
    }
    expect(() => feedV2ObjectKey("../../x", 1, "image/s.webp")).toThrow();
    expect(() => feedV2OriginKey("/media/v2/x/v1/poster%2ewebp")).toThrow();
  });
});
