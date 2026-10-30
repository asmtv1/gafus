import { describe, expect, it, vi } from "vitest";
import { FeedImageError, type FeedImageEngine } from "./image.js";
import { FeedVideoError, type VideoInfo } from "./video.js";
import { feedV2Mp4Arguments, feedV2SharedDecodeArguments, processFeedV2Image, validateFeedV2ImageInfo, validateFaststartMp4Header } from "./feed-v2.js";

const webp = () => {
  const bytes = new Uint8Array(90);
  bytes.set([82, 73, 70, 70, 82, 0, 0, 0, 87, 69, 66, 80]);
  return bytes;
};
const normal: VideoInfo = { width: 1920, height: 1080, durationSeconds: 25, hasAudio: true, rotated: false, hdr: false };
const atom = (type: string, payload: Uint8Array = new Uint8Array(0)): Uint8Array => {
  const result = new Uint8Array(payload.length + 8);
  new DataView(result.buffer).setUint32(0, result.length);
  for (let i = 0; i < 4; i++) result[i + 4] = type.charCodeAt(i);
  result.set(payload, 8);
  return result;
};
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(part => Array.from(part)));

describe("Feed V2 WebP processor", () => {
  it("generates three metadata-free variants without enlarging or cropping portrait images", async () => {
    const encode = vi.fn(async (_bytes: Uint8Array, opt: { maxEdge: number }) => {
      const ratio = Math.min(1, opt.maxEdge / 2400);
      return { width: Math.round(1200 * ratio), height: Math.round(2400 * ratio), bytes: webp() };
    });
    const engine = { inspect: async () => ({ format: "jpeg", width: 2400, height: 1200, orientation: 6 }), encode } as FeedImageEngine;
    const variants = await processFeedV2Image(new Uint8Array(100), engine);
    expect(Object.keys(variants)).toEqual(["small", "medium", "large"]);
    expect(variants.small).toMatchObject({ width: 180, height: 360 });
    expect(variants.medium).toMatchObject({ width: 360, height: 720 });
    expect(variants.large).toMatchObject({ width: 720, height: 1440 });
    for (const [, args] of encode.mock.calls) {
      expect(args).toMatchObject({ stripMetadata: true, autoOrient: true, withoutEnlargement: true });
    }
  });
  it("accepts HEIF/HEIC still images when the decoder supports them and denies animated input", () => {
    expect(validateFeedV2ImageInfo({ format: "heif", width: 1200, height: 2200,
      orientation: 6, pages: 1 }, 1000)).toMatchObject({ orientedWidth: 2200, orientedHeight: 1200 });
    expect(() => validateFeedV2ImageInfo({ format: "heif", width: 600, height: 800, pages: 2 }, 1000))
      .toThrow("IMAGE_ANIMATED");
    expect(() => validateFeedV2ImageInfo({ format: "gif", width: 600, height: 800 }, 1000))
      .toThrow("IMAGE_FORMAT");
  });
  it("rejects forged dimensions, animated inputs and corrupt images", async () => {
    const engine: FeedImageEngine = { inspect: async () => ({ format: "gif", width: 10, height: 10 }), encode: async () => ({ width: 1, height: 1, bytes: new Uint8Array(1) }) };
    await expect(processFeedV2Image(new Uint8Array(3), engine)).rejects.toThrow(FeedImageError);
    await expect(processFeedV2Image(new Uint8Array(0), engine)).rejects.toThrow("IMAGE_SIZE");
  });
});
describe("Chat2 optional shared FFmpeg decoder", () => {
  it("creates both independent progressive MP4 outputs from one input decode", () => {
    const args = feedV2SharedDecodeArguments("incoming.mov", "attempt", normal, [360, 720], 2);
    const flags = args.join(" ");
    expect(args.filter(x => x === "-i")).toHaveLength(1);
    expect(flags).toContain("split=2[split0][split1]");
    expect(flags).toContain("[v360]");
    expect(flags).toContain("[v720]");
    expect(args.filter(x => x === "0:a:0?")).toHaveLength(2);
    expect(args.filter(x => x === "libx264")).toHaveLength(2);
    expect(args.filter(x => x === "+faststart")).toHaveLength(2);
    expect(flags).toContain("attempt/360.mp4");
    expect(flags).toContain("attempt/720.mp4");
    expect(flags).not.toMatch(/1080|m3u8|hls/);
  });
  it("rejects invalid/shared duplicate qualities before touching media", () => {
    expect(() => feedV2SharedDecodeArguments("a", "b", normal, [360, 360])).toThrow("VIDEO_SHARED_DECODE_QUALITIES");
    expect(() => feedV2SharedDecodeArguments("a", "b", normal, [360])).toThrow("VIDEO_SHARED_DECODE_QUALITIES");
  });
});

describe("Feed V2 MP4 processor", () => {
  it("uses progressive H264/AAC with moov faststart, conservative threading and no HLS", () => {
    const args = feedV2Mp4Arguments("source.mov", "out.mp4", normal, 720);
    const command = args.join(" ");
    expect(command).toContain("-movflags +faststart");
    expect(command).toContain("-c:v libx264");
    expect(command).toContain("-c:a aac");
    expect(command).toContain("-threads 2");
    expect(command).not.toMatch(/m3u8|hls|segment-%03d|\.ts(?: |$)/);
    expect(feedV2Mp4Arguments("a", "b", { ...normal, hdr: true }, 360).join(" ")).toContain("tonemap");
  });
  it("keeps Moments unchanged but supports chat-only 1 decoder / 2 x264 / superfast", () => {
    const old = feedV2Mp4Arguments("source.mp4", "out.mp4", normal, 720);
    const optimized = feedV2Mp4Arguments("source.mp4", "out.mp4", normal, 720,
      {decoderThreads:1,encoderThreads:2,preset:"superfast"});
    expect(old.slice(old.indexOf("-threads"),old.indexOf("-threads")+2)).toEqual(["-threads","2"]);
    expect(old).toContain("veryfast");
    expect(old).not.toContain("-threads:v");
    expect(optimized.slice(optimized.indexOf("-threads"),optimized.indexOf("-threads")+2))
      .toEqual(["-threads","1"]);
    expect(optimized.indexOf("-threads")).toBeLessThan(optimized.indexOf("-i"));
    expect(optimized.slice(optimized.indexOf("-threads:v"),optimized.indexOf("-threads:v")+2))
      .toEqual(["-threads:v","2"]);
    expect(optimized).toContain("superfast");
    expect(optimized.indexOf("-threads:v")).toBeLessThan(optimized.length-1);
    expect(optimized.join(" ")).toContain("-c:v libx264");
    expect(optimized.join(" ")).toContain("-c:a aac");
    expect(optimized.join(" ")).toContain("-movflags +faststart");
    expect(optimized.join(" ")).not.toMatch(/m3u8|hls|1080/);
  });
  it("supports tuning both outputs of optional shared-decode without changing legacy callers", () => {
    const optimized=feedV2SharedDecodeArguments("source.mp4","dir",normal,[360,720],2,
      {decoderThreads:1,preset:"superfast"});
    expect(optimized.slice(optimized.indexOf("-threads"),optimized.indexOf("-threads")+2))
      .toEqual(["-threads","1"]);
    expect(optimized.filter(item=>item==="superfast")).toHaveLength(2);
    expect(optimized.filter(item=>item==="-threads:v")).toHaveLength(2);
    expect(optimized.filter(item=>item==="-i")).toHaveLength(1);
  });
  it("Feed uses capped CRF to avoid inflating simple media; Chat default remains ABR", () => {
    for (const quality of [360, 720] as const) {
      const standard = feedV2Mp4Arguments("source.mp4", "out.mp4", normal, quality);
      const feed = feedV2Mp4Arguments("source.mp4", "out.mp4", normal, quality,
        {decoderThreads:1,encoderThreads:2,preset:"superfast",rateControl:"capped-crf"});
      expect(standard).toContain("-b:v");
      expect(standard).not.toContain("-crf");
      expect(feed).not.toContain("-b:v");
      expect(feed.slice(feed.indexOf("-crf"), feed.indexOf("-crf")+2)).toEqual(["-crf","23"]);
      expect(feed).toContain("-maxrate");
      expect(feed).toContain("-bufsize");
      expect(feed).toContain("+faststart");
      expect(feed).not.toContain("-hls_time");
    }
  });
  it("requires a faststart moov atom before media payload", () => {
    const ftyp = atom("ftyp", new Uint8Array(4));
    const moov = atom("moov", new Uint8Array(6));
    const mdat = atom("mdat", new Uint8Array(8));
    expect(() => validateFaststartMp4Header(concat(ftyp, moov, mdat))).not.toThrow();
    expect(() => validateFaststartMp4Header(concat(ftyp, mdat, moov))).toThrow(FeedVideoError);
    expect(() => validateFaststartMp4Header(concat(ftyp, mdat))).toThrow();
    expect(() => validateFaststartMp4Header(concat(ftyp, moov))).toThrow();
    expect(() => validateFaststartMp4Header(new Uint8Array(24))).toThrow();
  });
});
