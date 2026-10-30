import { describe, expect, it } from "vitest";
import { FeedVideoError, validateVideoProbe, feedPosterArguments } from "./video.js";

describe("Feed V2 source video policy", () => {
  it("rejects video longer than the 120-second limit", () => {
    expect(() => validateVideoProbe({ format: { duration: "121" },
      streams: [{ codec_type: "video", width: 1280, height: 720 }] }, 1_000))
      .toThrow("VIDEO_TOO_LONG");
  });
  it("rejects corrupt input, oversized uploads and missing video stream", () => {
    expect(() => validateVideoProbe({}, 1000)).toThrow(FeedVideoError);
    expect(() => validateVideoProbe({ streams: [{ codec_type: "audio" }] }, 1000))
      .toThrow("VIDEO_STREAM_MISSING");
    expect(() => validateVideoProbe({}, 201 * 1024 * 1024)).toThrow("VIDEO_SIZE");
  });
  it("uses WebP poster instead of JPEG or HLS segments", () => {
    const args = feedPosterArguments("in.mov", "poster.webp");
    expect(args).toContain("libwebp");
    expect(args.at(-1)).toBe("poster.webp");
    expect(args.join(" ")).not.toContain(".m3u8");
  });
});
