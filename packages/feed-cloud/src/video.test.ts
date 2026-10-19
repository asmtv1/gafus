import { describe, expect, it } from "vitest";
import { createFeedCommandRunner } from "./index.js";
import {
  FeedVideoError, validateVideoProbe, feedFfmpegArguments, feedPosterArguments,
  parseFeedHlsPlaylist, validateSegmentSizes, FEED_SEGMENT_MAX_BYTES,
  validateFeedPacketTimeline, validateFeedHlsDuration,
  FEED_VIDEO_MAX_SECONDS, FEED_VIDEO_MAX_SEGMENTS,
} from "./video.js";

const probe = {
  format: { duration: "59.99", size: "50000000" },
  streams: [
    { codec_type: "video", codec_name: "hevc", width: 1920, height: 1080, duration: "59.99" },
    { codec_type: "audio", codec_name: "aac" },
  ],
};

describe("feed HLS processor rules", () => {
  it("accepts a valid source at exactly 120 seconds with or without audio", () => {
    expect(FEED_VIDEO_MAX_SECONDS).toBe(120);
    expect(FEED_VIDEO_MAX_SEGMENTS).toBeGreaterThanOrEqual(61);
    const result = validateVideoProbe({
      format: { duration: "120" },
      streams: [{ codec_type: "video", width: 1080, height: 1920 }],
    }, 200 * 1024 * 1024);
    expect(result).toMatchObject({ durationSeconds: 120, width: 1080, height: 1920, hasAudio: false });
    expect(validateVideoProbe(probe, 1000).hasAudio).toBe(true);
  });
  it("rejects long video, missing track, invalid duration, and oversized bytes", () => {
    for (const data of [
      { ...probe, format: { duration: "120.001" } },
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
  it("uses superfast while preserving HLS cadence, bitrate, codec and compatibility", () => {
    const args = feedFfmpegArguments("source.mp4", "./segments", {
      durationSeconds: 58, width: 1920, height: 1080,
      rotated: false, hdr: false, hasAudio: true,
    });
    const option = (flag: string) => args[args.indexOf(flag) + 1];
    expect(option("-preset")).toBe("superfast");
    expect(option("-c:v")).toBe("libx264");
    expect(option("-c:a")).toBe("aac");
    expect(option("-profile:v")).toBe("main");
    expect(option("-level")).toBe("3.1");
    expect(option("-fpsmax")).toBe("30");
    expect(option("-b:v")).toBe("1400k");
    expect(option("-maxrate")).toBe("1800k");
    expect(option("-b:a")).toBe("96k");
    expect(option("-hls_time")).toBe("2");
    expect(option("-hls_playlist_type")).toBe("vod");
    expect(option("-hls_segment_filename")).toBe("./segments/segment-%03d.ts");
    expect(option("-vf")).toContain("flags=lanczos");
    expect(option("-vf")).toContain("format=yuv420p");
  });
  it("skips redundant scaling only for compliant even-sized unrotated frames", () => {
    const base = { durationSeconds: 10, width: 1280, height: 720,
      rotated: false, hdr: false, hasAudio: true };
    const filter = (source: typeof base) => {
      const args = feedFfmpegArguments("source.mov", "./hls", source);
      return args[args.indexOf("-vf") + 1]!;
    };
    expect(filter(base)).toBe("format=yuv420p");
    expect(filter({ ...base, width: 640, height: 360 })).toBe("format=yuv420p");
    expect(filter({ ...base, width: 720, height: 1280 })).toBe("format=yuv420p");
    expect(filter({ ...base, width: 1281 })).toContain("flags=lanczos");
    expect(filter({ ...base, width: 641 })).toContain("flags=lanczos");
    expect(filter({ ...base, rotated: true })).toContain("flags=lanczos");
    expect(filter({ ...base, hdr: true })).toContain("tonemap");
    expect(filter({ ...base, hdr: true })).not.toContain("scale=w=");
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
  it("returns bounded process exit diagnostics without revealing stderr", async () => {
    const runner = createFeedCommandRunner({ ffmpeg: "/usr/bin/false", timeoutMs: 2000 });
    await expect(runner("ffmpeg", [], 1024)).rejects.toMatchObject({
      code: "VIDEO_PROCESS_FAILED", exitCode: 1, reason: "PROCESS_ERROR",
    });
  });
  it("rejects forged packet timelines without costly second full decode", () => {
    expect(() => validateFeedPacketTimeline("0.000000\n120.000000\n")).not.toThrow();
    expect(() => validateFeedPacketTimeline("0\n120.01\n")).toThrow("VIDEO_TOO_LONG");
    expect(() => validateFeedPacketTimeline("N/A\n")).toThrow("VIDEO_TIMELINE_INVALID");
    expect(() => validateFeedPacketTimeline("")).toThrow("VIDEO_DECODE_FAILED");
  });
  it("checks actual HLS duration without allowing a forged short container", () => {
    const valid = "#EXTM3U\n#EXTINF:2.0,\nsegment-000.ts\n#EXTINF:2.0,\nsegment-001.ts\n#EXT-X-ENDLIST";
    expect(() => validateFeedHlsDuration(valid)).not.toThrow();
    expect(() => validateFeedHlsDuration("#EXTM3U\n#EXTINF:120.0,\nsegment-000.ts\n#EXT-X-ENDLIST")).not.toThrow();
    expect(() => validateFeedHlsDuration("#EXTM3U\n#EXTINF:121,\nsegment-000.ts\n#EXT-X-ENDLIST"))
      .toThrow("VIDEO_TOO_LONG");
    expect(() => validateFeedHlsDuration("#EXTM3U\n#EXTINF:NaN,\nsegment-000.ts"))
      .toThrow("VIDEO_PLAYLIST_DURATION");
  });
  it("supports more than 60 HLS segments for two-minute video, but stays bounded", () => {
    const make = (n: number) => Array.from({length: n}, (_, i) =>
      "segment-" + String(i).padStart(3, "0") + ".ts");
    const keys = make(61);
    const playlist = "#EXTM3U\n" + keys.map(key => "#EXTINF:1.95,\n" + key + "\n").join("") + "#EXT-X-ENDLIST";
    expect(parseFeedHlsPlaylist(playlist)).toEqual(keys);
    expect(() => validateFeedHlsDuration(playlist)).not.toThrow();
    expect(() => validateSegmentSizes(keys.map(name => ({name, bytes: 1024})))).not.toThrow();
    const overflow = make(FEED_VIDEO_MAX_SEGMENTS + 1);
    expect(() => parseFeedHlsPlaylist("#EXTM3U\n" + overflow.join("\n") + "\n#EXT-X-ENDLIST"))
      .toThrow("VIDEO_SEGMENT_PATH");
    expect(() => validateSegmentSizes(overflow.map(name => ({name, bytes: 1024}))))
      .toThrow("VIDEO_SEGMENT_LIST");
  });
  it("enforces exactly the per-segment size limit", () => {
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: FEED_SEGMENT_MAX_BYTES }])).not.toThrow();
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: FEED_SEGMENT_MAX_BYTES + 1 }])).toThrow("VIDEO_SEGMENT_SIZE");
    expect(() => validateSegmentSizes([{ name: "segment-000.ts", bytes: 0 }])).toThrow("VIDEO_SEGMENT_SIZE");
  });
});
