import { describe, expect, it } from "vitest";
import { assertFeedFinalKey, assertFeedObjectKey, feedOriginKey } from "./index.js";

const base = "posts/owner-1/post_2";

describe("private feed object keys", () => {
  it("accepts source uploads and exactly one final WebP/MP4 namespace", () => {
    for (const key of [
      `${base}/incoming/upload_3/source.jpg`,
      `${base}/incoming/upload_3/source.mov`,
      "media/v2/media-4/v1/image/s.webp",
      "media/v2/media-4/v1/image/m.webp",
      "media/v2/media-4/v1/image/l.webp",
      "media/v2/media-4/v1/poster.webp",
      "media/v2/media-4/v1/video/360.mp4",
      "media/v2/media-4/v1/video/720.mp4",
    ]) expect(() => assertFeedObjectKey(key)).not.toThrow();
  });
  it("rejects attempts to escape post prefixes or access arbitrary objects", () => {
    for (const key of [
      "../albums/owner/private",
      "albums/owner/private/photo.webp",
      `${base}/incoming/upload_3/source.exe`,
      `${base}/attachments/media-4/../../private.jpg`,
      `${base}/attachments/media-4/hls/segment-999999999.ts`,
      `${base}/attachments/media-4/full.webp`,
      `${base}/attachments/media-4/source.jpg`,
      `/${base}/attachments/media-4/full.webp`,
    ]) expect(() => assertFeedObjectKey(key)).toThrow();
  });
  it("only exposes final representations from the origin, never raw sources", () => {
    expect(feedOriginKey("/media/v2/media-4/v1/image/l.webp"))
      .toBe("media/v2/media-4/v1/image/l.webp");
    for (const path of [
      `/${base}/incoming/upload_3/source.jpg`,
      `/${base}/incoming/upload_3/attempts/t/full.webp`,
      `/${base}/attachments/media-4/full.webp?x=1`,
      `/${base}/attachments/media-4/%66ull.webp`,
      `/${base}/attachments/media-4/full.webp#frag`,
    ]) expect(() => feedOriginKey(path)).toThrow();
    expect(() => assertFeedFinalKey(`${base}/incoming/upload_3/source.jpg`)).toThrow();
  });
});
