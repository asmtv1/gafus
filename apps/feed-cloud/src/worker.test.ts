import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { FeedCloudJob, FeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudWorker } from "./worker.js";
import { sharpFeedEngine } from "./sharp-engine.js";
import type { FeedCloudObjects } from "./objects.js";
const execute = promisify(execFile);
function job(kind: FeedCloudJob["kind"] = "publish_photo"): FeedCloudJob {
  return { id: "job", ownerId: "owner", postId: "post", uploadId: "upload", mediaId: "media",
    attemptToken: "12345678-1234-4234-8234-123456789012", kind, attempts: 1,
    sourceKeys: ["posts/owner/post/incoming/upload/source.jpg"], targetKeys: [],
    leaseUntil: new Date(Date.now() + 120_000).toISOString(), sourceETag: '"source-etag"', sourceBytes: 1000 };
}
function setup(source: Uint8Array) {
  const written = new Map<string, { bytes: Uint8Array; type: string }>();
  const core: FeedCloudInternalClient = { claimJobs: vi.fn(async () => []),
    completeJob: vi.fn(async () => ({ accepted: true })), failJob: vi.fn(async () => ({ accepted: true })),
    renewJob: vi.fn(async () => ({ accepted: true })), maintenance: vi.fn(async () => ({})) };
  const objects: FeedCloudObjects = {
    download: vi.fn(async (_key, path, max, signal) => { signal.throwIfAborted(); if (source.byteLength > max) throw new Error("SOURCE_SIZE"); await writeFile(path, source); }),
    create: vi.fn(async (key, bytes, type, signal) => { signal.throwIfAborted(); written.set(key, { bytes, type }); }),
    delete: vi.fn(async () => undefined),
  };
  return { core, objects, written, worker: createFeedCloudWorker({ core, objects, engine: sharpFeedEngine }) };
}
describe("feed cloud processing / actual Sharp and FFmpeg", () => {
  it("decodes, orients and strips photo metadata before publication", async () => {
    const source = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#335533" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { core, written, worker } = setup(source);
    expect(await worker.process(job())).toEqual({ accepted: true });
    expect(written.size).toBe(2);
    const full = await sharp(written.get("posts/owner/post/attachments/media/full.webp")!.bytes).metadata();
    expect(full).toMatchObject({ width: 600, height: 800, format: "webp" });
    expect(full.exif).toBeUndefined(); expect(full.icc).toBeUndefined();
    expect(core.completeJob).toHaveBeenCalledWith("job", expect.any(String), expect.objectContaining({ width: 600, height: 800 }));
  });
  it("starts both S3 variant writes together and waits for both before completing", async () => {
    const source = await sharp({ create: { width: 600, height: 480, channels: 3,
      background: "#445533" } }).png().toBuffer();
    const { worker, objects, core } = setup(source);
    const resolveWrites: (() => void)[] = [];
    vi.mocked(objects.create).mockImplementation(async () => new Promise<void>(resolve => {
      resolveWrites.push(resolve);
    }));
    const processing = worker.process(job());
    await vi.waitFor(() => expect(objects.create).toHaveBeenCalledTimes(2));
    expect(core.completeJob).not.toHaveBeenCalled();
    resolveWrites[0]!();
    await Promise.resolve();
    expect(core.completeJob).not.toHaveBeenCalled();
    resolveWrites[1]!();
    await expect(processing).resolves.toEqual({ accepted: true });
    expect(core.completeJob).toHaveBeenCalledOnce();
  });

  it("does not fail a claim until concurrent S3 writes have settled", async () => {
    const source = await sharp({ create: { width: 200, height: 200, channels: 3,
      background: "#445533" } }).png().toBuffer();
    const { worker, objects, core } = setup(source);
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: () => void;
    vi.mocked(objects.create)
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = resolve; }));
    const processing = worker.process(job());
    const completion = expect(processing).rejects.toThrow("S3 rejected one variant");
    await vi.waitFor(() => expect(objects.create).toHaveBeenCalledTimes(2));
    rejectFirst(new Error("S3 rejected one variant"));
    await Promise.resolve();
    expect(core.failJob).not.toHaveBeenCalled();
    resolveSecond();
    await completion;
    expect(core.failJob).toHaveBeenCalledOnce();
    expect(core.completeJob).not.toHaveBeenCalled();
  });

  it("creates an independent album copy without deleting album files", async () => {
    const source = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#335533" } }).webp().toBuffer();
    const { objects, written, worker } = setup(source);
    const claim = { ...job("copy_album"), uploadId: null, sourceETag: undefined,
      sourceKeys: ["albums/owner/album/photos/photo/thumb.webp", "albums/owner/album/photos/photo/full.webp"],
      targetKeys: ["posts/owner/post/attachments/media/thumb.webp", "posts/owner/post/attachments/media/full.webp"] };
    await worker.process(claim);
    expect(written.size).toBe(2); expect(objects.delete).not.toHaveBeenCalled();
    expect(objects.download).toHaveBeenCalledWith(claim.sourceKeys[1], expect.any(String), 10 * 1024 * 1024, expect.any(AbortSignal), undefined);
  });
  it("transcodes an actual small video to HLS without upscaling", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feed-video-fixture-"));
    try {
      const file = join(dir, "source.mp4");
      await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=green:s=320x240:r=15:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
      const { worker, written, core } = setup(await readFile(file));
      const claim = { ...job("publish_video"), sourceKeys: ["posts/owner/post/incoming/upload/source.mp4"] };
      await worker.process(claim);
      const output = vi.mocked(core.completeJob).mock.calls[0][2]!;
      expect(output).toMatchObject({ width: 320, height: 240, durationSeconds: 3 });
      expect(output.videoSegmentKeys!.length).toBeGreaterThan(0);
      for (const key of output.videoSegmentKeys!) expect(written.get(key)!.bytes.byteLength).toBeLessThanOrEqual(1_750_000);
      expect(Buffer.from(written.get(output.playlistKey!)!.bytes).toString()).toContain("#EXT-X-ENDLIST");
      expect(written.get(output.posterKey!)!.type).toBe("image/webp");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("rejects another owner's source before touching storage", async () => {
    const { worker, objects, core } = setup(new Uint8Array(1));
    await expect(worker.process({ ...job(), sourceKeys: ["posts/other/post/incoming/upload/source.jpg"] })).rejects.toThrow("UNTRUSTED_CLAIM");
    expect(objects.download).not.toHaveBeenCalled(); expect(core.completeJob).not.toHaveBeenCalled();
  });
  it("rejects corrupt image bytes and records a failed attempt", async () => {
    const { worker, core, written } = setup(new Uint8Array([1, 2, 3]));
    await expect(worker.process(job())).rejects.toThrow("INVALID_IMAGE");
    expect(core.failJob).toHaveBeenCalled(); expect(core.completeJob).not.toHaveBeenCalled(); expect(written.size).toBe(0);
  });
  it("does not erase outputs after a lost completion response", async () => {
    const source = await sharp({ create: { width: 50, height: 50, channels: 3, background: "green" } }).png().toBuffer();
    const { worker, core, objects, written } = setup(source);
    vi.mocked(core.completeJob).mockRejectedValue(new Error("lost response"));
    await expect(worker.process(job())).rejects.toThrow("lost response");
    expect(core.failJob).not.toHaveBeenCalled(); expect(objects.delete).not.toHaveBeenCalled(); expect(written.size).toBe(2);
  });
  it("deletes original upload, photo variants and every video/HLS object in a cleanup claim", async () => {
    const { worker, objects, core } = setup(new Uint8Array());
    const prefix = "posts/owner/post/";
    const keys = [
      prefix + "incoming/upload/source.mp4",
      prefix + "attachments/photo/thumb.webp",
      prefix + "attachments/photo/full.webp",
      prefix + "attachments/video/poster.webp",
      prefix + "attachments/video/hls/playlist.m3u8",
      prefix + "attachments/video/hls/segment-000.ts",
      prefix + "attachments/video/hls/segment-059.ts",
    ];
    await expect(worker.process({ ...job("delete_keys"), sourceKeys: keys })).resolves.toEqual({ accepted: true });
    expect(vi.mocked(objects.delete).mock.calls.map(([key]) => key)).toEqual(keys);
    expect(core.completeJob).toHaveBeenCalledTimes(1);
  });
  it("does not complete a cleanup job when S3 deletion fails, allowing a retry", async () => {
    const { worker, objects, core } = setup(new Uint8Array());
    vi.mocked(objects.delete).mockRejectedValueOnce(new Error("S3 temporarily unavailable"));
    await expect(worker.process({
      ...job("delete_keys"), sourceKeys: ["posts/owner/post/attachments/media/full.webp"],
    })).rejects.toThrow("S3 temporarily unavailable");
    expect(core.completeJob).not.toHaveBeenCalled();
    expect(core.failJob).toHaveBeenCalledWith("job", expect.any(String), "MEDIA_PROCESSING_FAILED");
  });
  it("cleanup can delete only feed keys and requires a live lease", async () => {
    const { worker, objects } = setup(new Uint8Array());
    await worker.process({ ...job("delete_keys"), sourceKeys: ["posts/owner/post/attachments/media/full.webp"] });
    expect(objects.delete).toHaveBeenCalledTimes(1);
    await expect(worker.process({ ...job("delete_keys"), sourceKeys: ["albums/owner/album/photos/photo/full.webp"] })).rejects.toThrow();
    await expect(worker.process({ ...job(), leaseUntil: new Date(Date.now() - 1).toISOString() })).rejects.toThrow("LEASE_EXPIRED");
  });
});
