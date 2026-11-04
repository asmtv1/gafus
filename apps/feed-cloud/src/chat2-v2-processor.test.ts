import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chat2V2SourceKey, type Chat2V2Job } from "@gafus/feed-cloud";
import { processChat2V2Asset, type Chat2V2Objects } from "./chat2-v2-processor";

const directories: string[] = [];
const root = fileURLToPath(new URL("../", import.meta.url));
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function temp() {
  const dir = await mkdtemp(join(root, ".chat2-v2-test-"));
  directories.push(dir);
  return dir;
}
const webp = () => {
  const bytes = new Uint8Array(20);
  bytes.set([82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80]);
  return bytes;
};
const job = (mime: Chat2V2Job["sourceMime"]): Chat2V2Job => {
  const conversationId = "room_1", ownerId = "actor_1", mediaId = randomUUID();
  return { conversationId, ownerId, mediaId, sourceMime: mime, sourceBytes: 32,
    sourceKey: chat2V2SourceKey(conversationId, ownerId, mediaId, mime) };
};
function objects() {
  const uploaded = new Map<string, Uint8Array | string>();
  const api: Chat2V2Objects = {
    download: vi.fn(async (_key, file) => { await writeFile(file, new Uint8Array(32)); }),
    create: vi.fn(async (key, bytes, mime) => {
      expect(mime).toBe("image/webp");
      uploaded.set(key, bytes);
    }),
    createFile: vi.fn(async (key, file) => { uploaded.set(key, await readFile(file)); }),
  };
  return { api, uploaded };
}
describe("Chat2 V2 worker-ready adapter, using Moments V2", () => {
  it("produces two WebP variants from shared Moments image encoder", async () => {
    const dir = await temp();
    const { api, uploaded } = objects();
    const encode = vi.fn(async (_bytes: Uint8Array, options: { maxEdge: number }) => {
      const ratio = Math.min(1, options.maxEdge / 1200);
      return { width: Math.round(1200 * ratio), height: Math.round(800 * ratio), bytes: webp() };
    });
    const imageEngine = { inspect: async () => ({ format: "jpeg", width: 1200, height: 800 }),
      encode };
    const result = await processChat2V2Asset(job("image/jpeg"), dir,
      { objects: api, engine: imageEngine }, new AbortController().signal);
    expect(result.kind).toBe("image");
    if (result.kind !== "image") throw new Error("INVALID_RESULT");
    expect(Object.keys(result.keys)).toEqual(["small", "medium"]);
    expect(result.imageSizes).toEqual({small:{width:360,height:240},medium:{width:720,height:480}});
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(Array.from(uploaded.keys())).toEqual(Object.values(result.keys));
    expect(encode.mock.calls.map(([, opt]) => opt.maxEdge)).toEqual([360, 720]);
  });
  it("publishes an MP4 poster and only encoded progressive MP4 renditions", async () => {
    const dir = await temp();
    const { api, uploaded } = objects();
    const input = job("video/quicktime");
    const info = { width: 1080, height: 1920, durationSeconds: 30,
      rotated: false, hdr: false, hasAudio: true };
    const processVideo = vi.fn(async (_source, workdir) => {
      const poster = join(workdir, "poster.webp");
      const path = join(workdir, "360.mp4");
      await writeFile(poster, webp());
      await writeFile(path, new Uint8Array(80));
      return { info, poster, mp4: [{ quality: 360 as const, path,
        bytes: 80, width: 203, height: 360 }] };
    });
    const result = await processChat2V2Asset(input, dir,
      { objects: api, engine: {} as never, processVideo }, new AbortController().signal);
    expect(processVideo).toHaveBeenCalledOnce();
    const videoOptions=processVideo.mock.calls[0]?.[4];
    expect(videoOptions).toMatchObject({
      decoderThreads:1,encoderThreads:2,preset:"superfast",
      parallelRenditions:false,sharedDecode:false,threadsPerEncoder:2,
    });
    expect(result.kind).toBe("video");
    if (result.kind !== "video") throw new Error("INVALID_RESULT");
    expect(result.posterKey).toMatch(/\/poster\.webp$/);
    expect(result.renditions).toHaveLength(1);
    expect(result.renditions[0].key).toMatch(/\/video\/360\.mp4$/);
    expect(Array.from(uploaded.keys())).toEqual([result.posterKey, result.renditions[0].key]);
  });
  it("does not return a READY manifest on partially failed output storage", async () => {
    const dir = await temp();
    const { api } = objects();
    let count = 0;
    api.create = vi.fn(async () => { if (++count === 2) throw new Error("S3_UNAVAILABLE"); });
    const engine = { inspect: async () => ({ format: "jpeg", width: 100, height: 100 }),
      encode: async () => ({ width: 100, height: 100, bytes: webp() }) };
    await expect(processChat2V2Asset(job("image/jpeg"), dir,
      { objects: api, engine }, new AbortController().signal)).rejects.toThrow("S3_UNAVAILABLE");
    expect(api.create).toHaveBeenCalledTimes(2);
  });
  it("rejects forged cross-chat source keys before any S3 access", async () => {
    const dir = await temp();
    const { api } = objects();
    const input = job("image/png");
    await expect(processChat2V2Asset({ ...input, sourceKey: input.sourceKey.replace(
      "room_1", "room_2") }, dir, { objects: api, engine: {} as never },
      new AbortController().signal)).rejects.toThrow("CHAT2_V2_UNTRUSTED_SOURCE_KEY");
    expect(api.download).not.toHaveBeenCalled();
  });
});
