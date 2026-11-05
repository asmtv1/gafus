import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FeedCloudJob, FeedCloudInternalClient } from "@gafus/feed-cloud";
import { createFeedCloudWorker, type FeedMediaV2Metrics } from "./worker.js";
import type { FeedCloudObjects } from "./objects.js";
const execute = promisify(execFile);
function job(kind: FeedCloudJob["kind"] = "publish_video"): FeedCloudJob {
  return { id: "job", ownerId: "owner", postId: "post", uploadId: "upload", mediaId: "media",
    attemptToken: "12345678-1234-4234-8234-123456789012", kind, attempts: 1,
    sourceKeys: ["posts/owner/post/incoming/upload/source.mp4"], targetKeys: [],
    leaseUntil: new Date(Date.now() + 120_000).toISOString(), sourceETag: '"source-etag"', sourceBytes: 1000 };
}
function setup(source: Uint8Array = new Uint8Array(), onMetrics?: (metrics: FeedMediaV2Metrics) => void) {
  const written = new Map<string, { bytes: Uint8Array; type: string }>();
  const core: FeedCloudInternalClient = { claimJobs: vi.fn(async () => []),
    completeJob: vi.fn(async () => ({ accepted: true })), failJob: vi.fn(async () => ({ accepted: true })),
    renewJob: vi.fn(async () => ({ accepted: true })), maintenance: vi.fn(async () => ({})) };
  const objects: FeedCloudObjects = {
    download: vi.fn(async (_key, path, max, signal) => {
      signal.throwIfAborted(); if (source.byteLength > max) throw new Error("SOURCE_SIZE");
      await writeFile(path, source);
    }),
    create: vi.fn(async (key, bytes, type, signal) => {
      signal.throwIfAborted(); written.set(key, { bytes, type });
    }),
    createFile: vi.fn(async (key, path, signal) => {
      signal.throwIfAborted(); written.set(key, { bytes: await readFile(path), type: "video/mp4" });
    }),
    delete: vi.fn(async () => undefined),
  };
  return { core, objects, written, worker: createFeedCloudWorker({ core, objects, onMetrics }) };
}
describe("Feed Cloud Job is ONLY background H264 360p", () => {
  it("refuses stale publish_photo and copy_album claims before reading S3 or writing READY", async () => {
    const { worker, objects, core } = setup();
    for (const kind of ["publish_photo", "copy_album"] as const) {
      await expect(worker.process({ ...job(kind),
        sourceKeys: kind === "publish_photo"
          ? ["posts/owner/post/incoming/upload/source.webp"]
          : ["albums/owner/album/photos/photo/full.webp"],
      })).rejects.toThrow("UNTRUSTED_CLAIM");
    }
    expect(objects.download).not.toHaveBeenCalled();
    expect(objects.create).not.toHaveBeenCalled();
    expect(core.completeJob).not.toHaveBeenCalled();
  });
  it("rejects old Cloud 720p/original-video transcode claims before downloading or writing anything", async () => {
    const { worker, objects, core } = setup();
    await expect(worker.process(job())).rejects.toThrow("UNTRUSTED_CLAIM");
    expect(objects.download).not.toHaveBeenCalled();
    expect(objects.createFile).not.toHaveBeenCalled();
    expect(core.completeJob).not.toHaveBeenCalled();
  });
  it("encodes only optional 360p from verified 720p, preserving the original poster", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".feed-video-360-only-fixture-"));
    try {
      const file = join(dir, "source.mp4");
      await execute("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=15", "-t", "2",
        "-threads", "2", "-c:v", "libx264", "-preset", "ultrafast",
        "-pix_fmt", "yuv420p", file]);
      const onMetrics = vi.fn();
      const { worker, written, core, objects } = setup(await readFile(file), onMetrics);
      const final720 = "media/v2/media/v1/video/720.mp4";
      const final360 = "media/v2/media/v1/video/360.mp4";
      const background:FeedCloudJob={...job(),uploadId:null,
        sourceKeys:[final720],targetKeys:[final360],sourceETag:undefined,sourceBytes:undefined};
      await expect(worker.process(background)).resolves.toEqual({ accepted: true });
      const output = vi.mocked(core.completeJob).mock.calls[0]?.[2];
      expect(output).toMatchObject({width:1280,height:720,durationSeconds:2,
        mp4Keys:[final360]});
      expect(output?.posterKey).toBeUndefined();
      expect(written.has(final360)).toBe(true);
      expect(written.has(final720)).toBe(false);
      expect(written.has("media/v2/media/v1/poster.webp")).toBe(false);
      expect(written.size).toBe(1);
      expect(objects.create).not.toHaveBeenCalled();
      expect(vi.mocked(objects.download).mock.calls[0]?.[0]).toBe(final720);
      expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({kind:"video",variantCount:1}));
      const saved = join(dir, "360.mp4");
      await writeFile(saved, written.get(final360)!.bytes);
      const probe = JSON.parse(await execute("ffprobe", ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,profile,width,height", "-of", "json", saved]).then(x=>x.stdout));
      expect(probe.streams[0]).toMatchObject({codec_name:"h264",profile:"Main",width:640,height:360});
      expect(JSON.stringify(onMetrics.mock.calls)).not.toContain("posts/owner/post");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 90_000);
  it("rejects cleanup, image jobs and other non-video claims without mutating S3", async () => {
    const { worker, objects, core } = setup();
    for (const kind of ["delete_keys", "cleanup_source", "publish_photo", "copy_album"] as const) {
      await expect(worker.process({ ...job(kind), sourceKeys: ["media/v2/photo/v1/image/s.webp"] }))
        .rejects.toThrow("UNTRUSTED_CLAIM");
    }
    expect(objects.delete).not.toHaveBeenCalled();
    expect(objects.create).not.toHaveBeenCalled();
    expect(objects.createFile).not.toHaveBeenCalled();
    expect(core.completeJob).not.toHaveBeenCalled();
  });
  it("rejects an expired background 360p lease before accessing S3", async () => {
    const { worker, objects } = setup();
    await expect(worker.process({ ...job("publish_video"), uploadId: null,
      sourceKeys: ["media/v2/media/v1/video/720.mp4"],
      targetKeys: ["media/v2/media/v1/video/360.mp4"],
      sourceETag: undefined, sourceBytes: undefined,
      leaseUntil: new Date(Date.now() - 1000).toISOString() }))
      .rejects.toThrow("LEASE_EXPIRED");
  });
});
