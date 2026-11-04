/**
 * Explicit opt-in GAFUS Chat2 media VIDEO processor acceptance.
 * Synthetic ~1s MP4 input, actual locally installed FFmpeg/FFprobe and real
 * processChat2V2Asset + Moments encoder. No S3, DB, cloud or user data;
 * injected object port is intentionally NOT a claim of full worker E2E.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createFeedCommandRunner, chat2V2SourceKey, chat2V2FinalKeys, type Chat2V2Job } from "@gafus/feed-cloud";
import { processChat2V2Asset, type Chat2V2Objects } from "../src/chat2-v2-processor";
import { sharpFeedEngine } from "../src/sharp-engine";

const workspace = "/Users/asmtv1/Desktop/gafus-refactor";
const scratch = join(workspace, ".gafus-refactoring", "architecture-qa-20261103-local");
const ownPaths: string[] = [];
if (process.env.GAFUS_ARCHQA_VIDEO_REAL_FFMPEG !== "1" ||
    resolve(process.cwd()).startsWith(workspace + sep) === false) {
  throw new Error("VIDEO_ARCHQA_REQUIRES_OPT_IN_INSIDE_GAFUS_REFACTOR");
}

beforeAll(() => {
  const report = execFileSync("df", ["-k", scratch], { encoding: "utf8", timeout: 4000 });
  const availableKiB = Number(report.trim().split("\n").at(-1)?.trim().split(/\s+/)[3]);
  expect(availableKiB).toBeGreaterThan(8 * 1024 * 1024);
});

afterEach(async () => {
  for (const p of ownPaths.splice(0)) {
    if (p.startsWith(scratch + sep)) await rm(p, { recursive: true, force: false });
  }
});

async function fixture() {
  const tmp = await mkdtemp(join(scratch, "chat2-video-own-"));
  ownPaths.push(tmp);
  const mediaId = randomUUID();
  const job: Chat2V2Job = {
    mediaId, conversationId: "synthetic_room_1", ownerId: "synthetic_actor_1",
    sourceMime: "video/mp4", sourceBytes: 0,
    sourceKey: chat2V2SourceKey("synthetic_room_1", "synthetic_actor_1", mediaId, "video/mp4"),
  };
  const original = join(tmp, "fixture.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=12", "-t", "1.1",
    "-threads", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", original], { timeout: 20_000, cwd: tmp, stdio: "pipe" });
  const length = (await stat(original)).size;
  expect(length).toBeGreaterThan(500);
  return { tmp, original, job: { ...job, sourceBytes: length } };
}
function objectPort(job: Chat2V2Job, original: string, options: { failKey?: string } = {}) {
  const objects = new Map<string, Uint8Array>();
  const port: Chat2V2Objects = {
    async download(key, destination, maxBytes, signal) {
      signal.throwIfAborted();
      expect(key).toBe(job.sourceKey);
      expect(job.sourceBytes).toBeLessThan(maxBytes);
      await copyFile(original, destination);
    },
    async create(key, value, type, signal) {
      signal.throwIfAborted();
      expect(type).toBe("image/webp");
      if (key === options.failKey) throw new Error("SYNTHETIC_S3_STORE_UNAVAILABLE");
      objects.set(key, Uint8Array.from(value));
    },
    async createFile(key, file, signal) {
      signal.throwIfAborted();
      if (key === options.failKey) throw new Error("SYNTHETIC_S3_STORE_UNAVAILABLE");
      const result = await readFile(file);
      expect(result.subarray(4, 8).toString("ascii")).toBe("ftyp");
      objects.set(key, result);
    },
  };
  return { port, objects };
}

describe("Chat2 V2 real FFmpeg video processor (isolated synthetic files)", () => {
  it("encodes a real MP4 into independently verified 360/720 MP4 + WebP poster", async () => {
    const { tmp, original, job } = await fixture();
    const { port, objects } = objectPort(job, original);
    const controller = new AbortController();
    const manifest = await processChat2V2Asset(job, tmp, {
      objects: port, engine: sharpFeedEngine,
      runner: createFeedCommandRunner({ timeoutMs: 35_000, signal: controller.signal }),
    }, controller.signal);
    expect(manifest.kind).toBe("video");
    if (manifest.kind !== "video") throw new Error("INVALID_VIDEO_MANIFEST");
    const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
    expect(manifest.posterKey).toBe(keys.video.poster);
    expect(manifest.renditions.map(x => x.quality)).toEqual([360, 720]);
    expect([...objects.keys()].sort()).toEqual([
      keys.video.poster, keys.video.variants[360], keys.video.variants[720],
    ].sort());
    const poster = objects.get(keys.video.poster)!;
    expect(Buffer.from(poster).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(Buffer.from(poster).subarray(8, 12).toString("ascii")).toBe("WEBP");
    for (const rendition of manifest.renditions) {
      const payload = objects.get(rendition.key)!;
      expect(payload.byteLength).toBe(rendition.bytes);
      expect(rendition.width).toBeLessThanOrEqual(1280);
      expect(rendition.height).toBeLessThanOrEqual(720);
      const encoded = join(tmp, `probe-${rendition.quality}.mp4`);
      await writeFile(encoded, payload);
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries",
        "stream=codec_name,width,height", "-of", "json", encoded],
        { timeout: 10_000, cwd: tmp }).toString("utf8"));
      expect(probe.streams?.[0]?.codec_name).toBe("h264");
    }
    console.log("PASS CHAT2_REAL_FFMPEG_VIDEO_360_720_WEBP_LOCAL");
  }, 70_000);

  it("rejects partial output-store outage; never returns a READY manifest", async () => {
    const { tmp, original, job } = await fixture();
    const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
    const { port } = objectPort(job, original, { failKey: keys.video.variants[720] });
    const controller = new AbortController();
    await expect(processChat2V2Asset(job, tmp, {
      objects: port, engine: sharpFeedEngine,
      runner: createFeedCommandRunner({ timeoutMs: 35_000, signal: controller.signal }),
    }, controller.signal)).rejects.toThrow("SYNTHETIC_S3_STORE_UNAVAILABLE");
    console.log("PASS CHAT2_REAL_FFMPEG_VIDEO_STORE_FAILURE_NOT_READY");
  }, 70_000);
});
