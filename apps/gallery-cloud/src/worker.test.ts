import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { createGalleryCloudWorker } from "./worker";
import { sharpGalleryEngine } from "./sharp-engine";
import { objectMd5 } from "@gafus/gallery-storage/objects";
import type { GalleryObjectStore } from "@gafus/gallery-storage/objects";
import type { GalleryInternalClient } from "./internal";
const now = 1800000000000,
  sourceKey = "albums/o/a/incoming/u/source.png",
  staging = "albums/o/a/incoming/u/attempts/t",
  final = "albums/o/a/photos/p";
async function setup() {
  const bytes = await sharp({ create: { width: 60, height: 40, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const data = new Map([[sourceKey, bytes]]);
  const claim = {
    uploadId: "u",
    photoId: "p",
    attemptToken: "t",
    sourceKey,
    sourceETag: objectMd5(bytes),
    thumbKey: staging + "/thumb.webp",
    fullKey: staging + "/full.webp",
    leaseUntil: new Date(now + 120000).toISOString(),
    reservationExpiresAt: new Date(now + 600000).toISOString(),
  };
  const core = {
    claimUpload: vi.fn(async () => claim),
    completeUpload: vi.fn(async () => ({ accepted: true, status: "publishing" })),
    failUpload: vi.fn(async () => ({ accepted: true, status: "failed" })),
    claimJobs: vi.fn(async () => []),
    completeJob: vi.fn(async () => ({ accepted: true, status: "done" })),
    failJob: vi.fn(async () => ({ accepted: true, status: "failed" })),
    maintenance: vi.fn(async () => ({
      expiredUploads: 0,
      reconciledJobs: 0,
      recoveredCleanupJobs: 0,
      processUploadIds: ["u"],
    })),
  } as unknown as GalleryInternalClient;
  const meta = (b: Uint8Array) => ({
    etag: objectMd5(b),
    bytes: b.length,
    contentType: "image/webp",
  });
  const objects = {
    head: vi.fn(async (k: string) => (data.has(k) ? meta(data.get(k)!) : null)),
    read: vi.fn(async (k: string, e?: string) => {
      const b = data.get(k)!;
      if (e && e !== objectMd5(b)) throw Error("SOURCE_CHANGED");
      return { bytes: b, metadata: meta(b) };
    }),
    create: vi.fn(async (k: string, b: Uint8Array) => {
      if (data.has(k) && objectMd5(data.get(k)!) !== objectMd5(b))
        throw Error("IMMUTABLE_CONFLICT");
      data.set(k, Buffer.from(b));
      return meta(b);
    }),
    delete: vi.fn(async (k: string) => {
      data.delete(k);
    }),
  } as GalleryObjectStore;
  const queue = { send: vi.fn(async () => {}) };
  const worker = createGalleryCloudWorker({
    core,
    objects,
    engine: sharpGalleryEngine,
    queue,
    now: () => now,
  });
  return { bytes, data, claim, core, objects, queue, worker };
}
describe("lease, duplicate and job retries with real processing", () => {
  it("duplicate delivery claims first and performs no unregistered read", async () => {
    const x = await setup();
    vi.mocked(x.core.claimUpload).mockResolvedValueOnce(x.claim).mockResolvedValueOnce(null);
    await x.worker.processUpload("u");
    const reads = vi.mocked(x.objects.read).mock.calls.length;
    await x.worker.processUpload("u");
    expect(x.objects.read).toHaveBeenCalledTimes(reads);
    expect(x.core.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ attemptToken: "t", sourceETag: x.claim.sourceETag }),
    );
    expect(x.data.has(sourceKey)).toBe(true);
  });
  it("makes an immutable veterinary preview without removing the private original", async () => {
    const x = await setup();
    const source = "users/o/pets/p/vet-visits/v/a/original.png";
    const target = "users/o/pets/p/vet-visits/v/a/thumb.webp";
    const bytes = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    x.data.set(source, bytes);
    // The mock's source metadata is image/webp by default; use realistic PNG metadata.
    const read = vi.mocked(x.objects.read).getMockImplementation()!;
    vi.spyOn(x.objects, "read").mockImplementation(async (key, etag, signal, maxBytes) => {
      if (key === source)
        return {
          bytes,
          metadata: { etag: objectMd5(bytes), bytes: bytes.length, contentType: "image/png" },
        };
      return read(key, etag, signal, maxBytes);
    });
    const job = {
      jobId: "vet",
      kind: "vetPreview" as const,
      attemptToken: "jt",
      sourceKeys: [source],
      sourceETags: [objectMd5(bytes)],
      targetKeys: [target],
      leaseUntil: x.claim.leaseUntil,
      writeMode: "create-if-absent" as const,
    };
    await x.worker.processJob(job, now + 50000);
    expect(x.core.completeJob).toHaveBeenCalledWith({ jobId: "vet", attemptToken: "jt" });
    expect(x.data.get(source)).toEqual(bytes);
    const result = await sharp(x.data.get(target)!).metadata();
    expect(result.format).toBe("webp");
    expect(Math.max(result.width!, result.height!)).toBeLessThanOrEqual(640);
    await x.worker.processJob(job, now + 50000);
    expect(x.data.get(source)).toEqual(bytes);
    expect(x.core.failJob).not.toHaveBeenCalled();
  });
  it("rejects any veterinary job with a foreign preview prefix before reading S3", async () => {
    const x = await setup();
    const job = {
      jobId: "vet",
      kind: "vetPreview" as const,
      attemptToken: "jt",
      sourceKeys: ["users/o/pets/p/vet-visits/v/a/original.png"],
      sourceETags: [objectMd5(x.bytes)],
      targetKeys: ["users/other/pets/p/vet-visits/v/a/thumb.webp"],
      leaseUntil: x.claim.leaseUntil,
      writeMode: "create-if-absent" as const,
    };
    await expect(x.worker.processJob(job, now + 50000)).rejects.toThrow("UNTRUSTED_CLAIM");
    expect(x.objects.read).not.toHaveBeenCalled();
    expect(x.objects.create).not.toHaveBeenCalled();
  });
  it("partial staging writes retry without deleting the source", async () => {
    const x = await setup();
    const original = vi.mocked(x.objects.create).getMockImplementation()!;
    let once = true;
    vi.spyOn(x.objects, "create").mockImplementation(async (...args) => {
      if (args[0].endsWith("/full.webp") && once) {
        once = false;
        throw Error("NETWORK");
      }
      return original(...args);
    });
    await expect(x.worker.processUpload("u")).rejects.toThrow("NETWORK");
    expect(x.data.has(staging + "/thumb.webp")).toBe(true);
    expect(x.data.has(sourceKey)).toBe(true);
    await x.worker.processUpload("u");
    expect(x.core.completeUpload).toHaveBeenCalledTimes(1);
    expect(x.objects.delete).not.toHaveBeenCalled();
  });
  it("ambiguous completion is retried without reporting failure", async () => {
    const x = await setup();
    vi.mocked(x.core.completeUpload).mockRejectedValueOnce(Error("NETWORK"));
    await expect(x.worker.processUpload("u")).rejects.toThrow();
    expect(x.core.failUpload).not.toHaveBeenCalled();
    expect(x.data.has(sourceKey)).toBe(true);
  });
  it("expired lease performs no object read or write", async () => {
    const x = await setup();
    x.claim.leaseUntil = new Date(now + 4000).toISOString();
    await expect(x.worker.processUpload("u")).rejects.toThrow("LEASE_EXPIRED");
    expect(x.objects.read).not.toHaveBeenCalled();
    expect(x.objects.create).not.toHaveBeenCalled();
  });
  it("conditional snapshot mismatch fails permanently", async () => {
    const x = await setup();
    x.claim.sourceETag = '"' + "a".repeat(32) + '"';
    await x.worker.processUpload("u");
    expect(x.core.failUpload).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "SOURCE_CHANGED", retryable: false }),
    );
    expect(x.objects.create).not.toHaveBeenCalled();
  });
  it("publish partial failure retries immutably and retains staging/source until durable cleanup", async () => {
    const x = await setup();
    await x.worker.processUpload("u");
    const keys = [staging + "/thumb.webp", staging + "/full.webp"];
    const job = {
      jobId: "j",
      kind: "publish" as const,
      attemptToken: "jt",
      sourceKeys: keys,
      sourceETags: keys.map((k) => objectMd5(x.data.get(k)!)),
      targetKeys: [final + "/thumb.webp", final + "/full.webp"],
      leaseUntil: x.claim.leaseUntil,
      writeMode: "create-if-absent" as const,
    };
    const original = vi.mocked(x.objects.create).getMockImplementation()!;
    let once = true;
    vi.spyOn(x.objects, "create").mockImplementation(async (...args) => {
      if (args[0] === job.targetKeys[1] && once) {
        once = false;
        throw Error("NETWORK");
      }
      return original(...args);
    });
    await expect(x.worker.processJob(job, now + 50000)).rejects.toThrow("NETWORK");
    expect(x.core.failJob).toHaveBeenCalledWith(
      expect.objectContaining({ attemptToken: "jt", retryable: true }),
    );
    await x.worker.processJob(job, now + 50000);
    expect(x.core.completeJob).toHaveBeenCalledTimes(1);
    expect(x.objects.delete).not.toHaveBeenCalled();
    expect(keys.every((k) => x.data.has(k))).toBe(true);
    expect(x.data.has(sourceKey)).toBe(true);
  });
  it("publishes the exact completed upload immediately without waiting for maintenance", async () => {
    const x = await setup();
    vi.mocked(x.core.claimJobs).mockImplementation(async (_limit, uploadId) => {
      if (uploadId !== "u") throw Error("UNSCOPED_CLAIM");
      const keys = [staging + "/thumb.webp", staging + "/full.webp"];
      return [
        {
          jobId: "immediate",
          kind: "publish",
          attemptToken: "jt",
          sourceKeys: keys,
          sourceETags: keys.map((key) => objectMd5(x.data.get(key)!)),
          targetKeys: [final + "/thumb.webp", final + "/full.webp"],
          leaseUntil: x.claim.leaseUntil,
          writeMode: "create-if-absent",
        },
      ];
    });
    await x.worker.processUpload("u");
    expect(x.core.claimJobs).toHaveBeenCalledWith(1, "u");
    expect(x.core.completeJob).toHaveBeenCalledExactlyOnceWith({
      jobId: "immediate",
      attemptToken: "jt",
    });
    expect(x.data.has(final + "/thumb.webp")).toBe(true);
    expect(x.data.has(final + "/full.webp")).toBe(true);
    expect(x.core.maintenance).not.toHaveBeenCalled();
  });
  it("keeps the durable fallback when immediate publish claim fails", async () => {
    const x = await setup();
    vi.mocked(x.core.claimJobs).mockRejectedValueOnce(Error("NETWORK"));
    await expect(x.worker.processUpload("u")).resolves.toBeUndefined();
    expect(x.core.completeUpload).toHaveBeenCalledTimes(1);
    expect(x.core.failUpload).not.toHaveBeenCalled();
    expect(x.core.maintenance).not.toHaveBeenCalled();
    expect(x.data.has(staging + "/thumb.webp")).toBe(true);
    expect(x.data.has(staging + "/full.webp")).toBe(true);
  });
  it("maintenance drains cleanup before publishing within the same timer invocation", async () => {
    const x = await setup();
    await x.worker.processUpload("u");
    vi.mocked(x.core.claimJobs).mockClear();
    const keys = [staging + "/thumb.webp", staging + "/full.webp"];
    vi.mocked(x.core.claimJobs)
      .mockResolvedValueOnce([
        {
          jobId: "cleanup",
          kind: "delete",
          attemptToken: "ct",
          sourceKeys: ["albums/o/a/incoming/old/source.png"],
          sourceETags: [],
          targetKeys: [],
          leaseUntil: x.claim.leaseUntil,
          writeMode: "create-if-absent",
        },
      ])
      .mockResolvedValueOnce([
        {
          jobId: "publish",
          kind: "publish",
          attemptToken: "pt",
          sourceKeys: keys,
          sourceETags: keys.map((k) => objectMd5(x.data.get(k)!)),
          targetKeys: [final + "/thumb.webp", final + "/full.webp"],
          leaseUntil: x.claim.leaseUntil,
          writeMode: "create-if-absent",
        },
      ])
      .mockResolvedValueOnce([]);
    await x.worker.maintenance();
    expect(x.core.completeJob).toHaveBeenCalledWith({ jobId: "cleanup", attemptToken: "ct" });
    expect(x.core.completeJob).toHaveBeenCalledWith({ jobId: "publish", attemptToken: "pt" });
    expect(x.core.claimJobs).toHaveBeenCalledTimes(3);
    expect(x.data.has(final + "/full.webp")).toBe(true);
  });
  it("bounds maintenance to ten jobs without claiming the remaining backlog", async () => {
    const x = await setup();
    let claimed = 0;
    vi.mocked(x.core.claimJobs).mockImplementation(async () => [
      {
        jobId: `cleanup-${++claimed}`,
        kind: "delete",
        attemptToken: "ct",
        sourceKeys: [],
        sourceETags: [],
        targetKeys: [],
        leaseUntil: x.claim.leaseUntil,
        writeMode: "create-if-absent",
      },
    ]);
    await x.worker.maintenance();
    expect(x.core.claimJobs).toHaveBeenCalledTimes(10);
    expect(x.core.completeJob).toHaveBeenCalledTimes(10);
  });
  it("does not claim another job when the invocation budget is nearly exhausted", async () => {
    const x = await setup();
    let clock = now;
    vi.mocked(x.core.claimJobs).mockResolvedValue([
      {
        jobId: "cleanup",
        kind: "delete",
        attemptToken: "ct",
        sourceKeys: [],
        sourceETags: [],
        targetKeys: [],
        leaseUntil: x.claim.leaseUntil,
        writeMode: "create-if-absent",
      },
    ]);
    vi.mocked(x.core.completeJob).mockImplementation(async () => {
      clock += 41000;
      return { accepted: true, status: "done" };
    });
    const worker = createGalleryCloudWorker({
      core: x.core,
      objects: x.objects,
      engine: sharpGalleryEngine,
      queue: x.queue,
      now: () => clock,
    });
    await worker.maintenance();
    expect(x.core.claimJobs).toHaveBeenCalledTimes(1);
    expect(x.core.completeJob).toHaveBeenCalledTimes(1);
  });
  it("maintenance queues recovered IDs and preserves cleanup while disabled", async () => {
    const x = await setup();
    await x.worker.maintenance();
    expect(x.queue.send).toHaveBeenCalledWith("u");
    x.queue.send.mockClear();
    const disabled = createGalleryCloudWorker({
      core: x.core,
      objects: x.objects,
      engine: sharpGalleryEngine,
      queue: x.queue,
      now: () => now,
      enabled: false,
    });
    await disabled.maintenance();
    expect(x.queue.send).not.toHaveBeenCalled();
    expect(x.core.claimJobs).toHaveBeenCalledTimes(2);
    expect(x.core.maintenance).toHaveBeenCalledTimes(2);
  });
});
