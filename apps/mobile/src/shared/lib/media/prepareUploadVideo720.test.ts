import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

const files = vi.hoisted(() => ({ sizes: new Map<string, number>(), deleted: [] as string[] }));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(readonly uri: string) {}
    get size() { return files.sizes.get(this.uri) ?? 0; }
    delete() { files.deleted.push(this.uri); }
  },
}));
import { target720LongEdge, prepareUploadVideo720 } from "./prepareUploadVideo720";
const oldFlag = process.env.EXPO_PUBLIC_CLIENT_VIDEO_720;
const originalPlatform = Platform.OS;
beforeEach(() => {
  process.env.EXPO_PUBLIC_CLIENT_VIDEO_720 = "true";
  Platform.OS = "ios";
  files.sizes.clear(); files.deleted.length = 0;
});
afterEach(() => {
  Platform.OS = originalPlatform;
  if (oldFlag === undefined) delete process.env.EXPO_PUBLIC_CLIENT_VIDEO_720;
  else process.env.EXPO_PUBLIC_CLIENT_VIDEO_720 = oldFlag;
});

describe("single phone 720p MP4 for Moments and Chat2", () => {
  it("preserves the short 720px edge for portrait and landscape without upscaling", () => {
    expect(target720LongEdge(1920, 1080)).toBe(1280);
    expect(target720LongEdge(1080, 1920)).toBe(1280);
    expect(target720LongEdge(1280, 720)).toBe(1280);
    expect(target720LongEdge(720, 1280)).toBe(1280);
    expect(target720LongEdge(640, 360)).toBeNull();
    expect(target720LongEdge(0, 0)).toBeNull();
    expect(target720LongEdge(100, 900)).toBeNull();
  });
  it("encodes just one 720 tier and cleans only native output", async () => {
    const encoder = vi.fn(async () => "file:///tmp/encoded.mp4");
    files.sizes.set("file:///tmp/encoded.mp4", 12_000_000);
    const prepared = await prepareUploadVideo720({
      uri: "file:///original/clip.mov", width: 1080, height: 1920,
    }, encoder, uri => uri === "file:///tmp/encoded.mp4");
    expect(encoder).toHaveBeenCalledOnce();
    expect(encoder).toHaveBeenCalledWith("file:///original/clip.mov", expect.objectContaining({
      maxSize: 1280, bitrate: 1_800_000, compressionMethod: "manual",
      minimumFileSizeForCompress: 0,
    }));
    expect(prepared).toMatchObject({ uri: "file:///tmp/encoded.mp4", mime: "video/mp4", bytes: 12_000_000 });
    prepared?.dispose();
    expect(files.deleted).toEqual(["file:///tmp/encoded.mp4"]);
  });
  it("keeps the legacy server fallback on native errors without deleting the original", async () => {
    expect(await prepareUploadVideo720({ uri: "file:///original.mp4", width: 1920, height: 1080 },
      async () => { throw Error("CODEC_UNAVAILABLE"); })).toBeNull();
    expect(files.deleted).toEqual([]);
  });
  it("rejects empty / oversized native output and disables feature safely", async () => {
    const encoder = vi.fn(async () => "file:///tmp/output.mp4");
    expect(await prepareUploadVideo720({ uri: "file:///original.mp4", width: 1920, height: 1080 }, encoder))
      .toBeNull();
    expect(files.deleted).toEqual(["file:///tmp/output.mp4"]);
    files.deleted.length = 0;
    files.sizes.set("file:///tmp/output.mp4", 201 * 1024 * 1024);
    expect(await prepareUploadVideo720({ uri: "file:///original.mp4", width: 1920, height: 1080 }, encoder))
      .toBeNull();
    expect(files.deleted).toEqual(["file:///tmp/output.mp4"]);
    process.env.EXPO_PUBLIC_CLIENT_VIDEO_720 = "false";
    expect(await prepareUploadVideo720({ uri: "file:///original.mp4", width: 1920, height: 1080 }, encoder))
      .toBeNull();
    expect(encoder).toHaveBeenCalledTimes(2);
  });
  it("does not re-encode verified MP4 originals, and never deletes source", async () => {
    const uri = "file:///original/ready.mp4";
    files.sizes.set(uri, 5_000_000);
    const encoder = vi.fn(async () => "file:///tmp/must-not-run.mp4");
    const prepared = await prepareUploadVideo720({
      uri, width: 1280, height: 720, mimeType: "video/mp4",
    }, encoder, probeUri => probeUri === uri);
    expect(encoder).not.toHaveBeenCalled();
    expect(prepared).toMatchObject({ uri, bytes: 5_000_000, mime: "video/mp4" });
    prepared?.dispose();
    expect(files.deleted).toEqual([]);
  });
  it("re-encodes MP4 if source fails codec, bitrate or FPS checks", async () => {
    const source = "file:///original/60fps.mp4";
    const target = "file:///tmp/30fps.mp4";
    files.sizes.set(target, 4_000_000);
    const encoder = vi.fn(async () => target);
    const prepared = await prepareUploadVideo720({uri:source,width:1280,height:720},
      encoder, uri=>uri===target);
    expect(encoder).toHaveBeenCalledOnce();
    expect(prepared).toMatchObject({uri:target});
    prepared?.dispose();
    expect(files.deleted).toEqual([target]);
  });
  it("rejects device output that is still over 30 FPS or has the wrong codec", async () => {
    const target = "file:///tmp/invalid60fps.mp4";
    files.sizes.set(target, 5_000_000);
    const prepared = await prepareUploadVideo720({
      uri: "file:///original/input.mov", width: 1920, height: 1080,
    }, async () => target, () => false);
    expect(prepared).toBeNull();
    expect(files.deleted).toEqual([target]);
  });
});
