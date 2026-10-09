import { describe, expect, it } from "vitest";
import {
  FeedVideoError, validateVideoProbe, feedFfmpegArguments, feedPosterArguments,
  parseFeedHlsPlaylist, validateSegmentSizes, FEED_SEGMENT_MAX_BYTES,
} from "./video.js";

const probe = {
  format: { duration: "59.99", size: "50000000" },
  streams: [
    { codec_type: "video", codec_name: "hevc", width: 1920, height: 1080, duration: "59.99" },
    { codec_type: "audio", codec_name: "aac" },
  ],
};

describe("feed HLS processor rules", () => {
  it("accepts a valid source at the one-minute boundary with or without audio", () => {
    const result = validateVideoProbe({
      format: { duration: "60" },
      streams: [{ codec_type: "video", width: 1080, height: 1920 }],
    }, 200 * 1024 * 1024);
    expect(result).toMatchObject({ durationSeconds: 60, width: 1080, height: 1920, hasAudio: false });
    expect(validateVideoProbe(probe, 1000).hasAudio).toBe(true);
  });
  it("rejects long video, missing track, invalid duration, and oversized bytes", () => {
    for (const data of [
      { ...probe, format: { duration: "60.001" } },
      { ...probe, streams: [{ codec_type: "audio" }] },
      { ...probe, format: { duration: "unknown" }, streams: [{ codec_type: "video", width: 20, height: 20 }] },
    ]) expect(() => validateVideoProbe(data, 2_000_000)).toThrow(FeedVideoError);
    expect(() => validateVideoProbe(probe, 200 * 1024 * 1024 + 1)).toThrow("VIDEO_SIZE");
  });
  it("handles rotation, HDR and no audio without enlarging source", () => {
    const result = validateVideoProbe({
      format: { duration: "12" },
      streams: [{
        codec_type: "video", width: 1920, height: 1080, color_transfer: "smpte2084",
        side_data_list: [{ rotation: 90 }],
      }],
    }, 1000);
    expect(result).toMatchObject({ width: 1080, height: 1920, rotated: true, hdr: true });
    const args = feedFfmpegArguments("source.mov", "/tmp/out", result);
    expect(args.join(" ")).toContain("tonemap");
    expect(args.join(" ")).toContain("w='min(720,iw)':h='min(1280,ih)'");
    expect(args).toContain("-fpsmax");
    expect(args.join(" ")).toContain("force_original_aspect_ratio=decrease");
    expect(feedPosterArguments("source.mov", "poster.webp")).toContain("libwebp");
  });
  it("rejects untrusted and incomplete HLS playlists", () => {
    const valid = "#EXTM3U\n#EXTINF:2,\nsegment-000.ts\n#EXTINF:2,\nsegment-001.ts\n#EXT-X-ENDLIST";
    expect(parseFeedHlsPlaylist(valid)).toEqual(["segment-000.ts", "segment-001.ts"]);
    for (const text of [
      "#EXTM3U\n../private.ts\n#EXT-X-ENDLIST",
      "#EXTM3U\nsegment-000.ts\nsegment-000.ts\n#EXT-X-ENDLIST",
      "#EXTM3U\nsegment-001.ts",
    ]) expect(() => parseFeedHlsPlaylist(text)).toThrow(FeedVideoError);
  });
  it("enforces exactly the per-segment size limit", () => {
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: FEED_SEGMENT_MAX_BYTES }])).not.toThrow();
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: FEED_SEGMENT_MAX_BYTES + 1 }])).toThrow("VIDEO_SEGMENT_SIZE");
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: 0 }])).toThrow("VIDEO_SEGMENT_SIZE");
  });
});
