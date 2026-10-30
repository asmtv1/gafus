import { describe, expect, it } from "vitest";
import { FeedImageError } from "./image.js";
import { validateFeedV2ImageInfo } from "./feed-v2.js";

describe("one Moments image processing policy", () => {
  it("accepts JPEG/PNG/WebP/HEIF and rotates by actual decoded metadata", () => {
    expect(validateFeedV2ImageInfo({ format: "heic", width: 800, height: 1200, orientation: 6 }, 100))
      .toEqual({ orientedWidth: 1200, orientedHeight: 800 });
  });
  it("rejects animation, wrong MIME, oversized uploads and zip bombs", () => {
    for (const [info, bytes] of [
      [{ format: "gif", width: 10, height: 10 }, 100],
      [{ format: "webp", width: 10, height: 10, pages: 2 }, 100],
      [{ format: "jpeg", width: 10000, height: 5001 }, 100],
      [{ format: "png", width: 1200, height: 1000 }, 10 * 1024 * 1024 + 1],
    ] as const) expect(() => validateFeedV2ImageInfo(info, bytes)).toThrow(FeedImageError);
  });
});
