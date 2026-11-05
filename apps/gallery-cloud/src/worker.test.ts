import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { createGalleryCloudWorker } from "./worker";
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
  const worker = createGalleryCloudWorker({
    core,
    objects,
    now: () => now,
  });
  return { bytes, data, claim, core, objects, worker };
}
describe("Gallery cloud: client WebP only; retention, move and vet preview",()=>{
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
  it("rejects every old S3/queue photo upload before accessing Core or S3",async()=>{
    const x=await setup();
    await expect(x.worker.processUpload("u")).rejects.toThrow("GALLERY_CLIENT_WEBP_REQUIRED");
    expect(x.core.claimUpload).not.toHaveBeenCalled();
    expect(x.objects.read).not.toHaveBeenCalled();
    expect(x.objects.create).not.toHaveBeenCalled();
  });
  it("ignores recovered legacy uploads while continuing S3 cleanup",async()=>{
    const x=await setup();
    const old="albums/o/a/incoming/u/source.png";
    vi.mocked(x.core.claimJobs).mockResolvedValueOnce([{
      jobId:"delete-1",kind:"delete",attemptToken:"token",
      sourceKeys:[old],sourceETags:[],targetKeys:[],
      leaseUntil:x.claim.leaseUntil,writeMode:"create-if-absent",
    }]).mockResolvedValueOnce([]);
    const result=await x.worker.maintenance();
    expect(result.processUploadIds).toEqual(["u"]); // ignored, NEVER dispatched
    expect(x.data.has(old)).toBe(false);
    expect(x.core.claimUpload).not.toHaveBeenCalled();
    expect(x.core.completeJob).toHaveBeenCalledWith({jobId:"delete-1",attemptToken:"token"});
  });
  it("copies already-encoded WebP on album move, without any image encoder",async()=>{
    const x=await setup();
    const body=await sharp({create:{width:100,height:75,channels:3,background:"blue"}}).webp().toBuffer();
    const a="albums/o/a/photos/p/thumb.webp",b="albums/o/a/photos/p/full.webp";
    const c="albums/o/b/photos/p/thumb.webp",d="albums/o/b/photos/p/full.webp";
    x.data.set(a,body);x.data.set(b,body);
    await x.worker.processJob({
      jobId:"move-1",kind:"move",attemptToken:"m1",
      sourceKeys:[a,b],sourceETags:[objectMd5(body),objectMd5(body)],
      targetKeys:[c,d],leaseUntil:x.claim.leaseUntil,writeMode:"create-if-absent",
    },now+50_000);
    expect(x.data.get(c)).toEqual(body);
    expect(x.data.get(d)).toEqual(body);
    expect(x.objects.delete).not.toHaveBeenCalled();
    expect(x.core.completeJob).toHaveBeenCalledOnce();
  });
  it("rejects foreign owner target before reading any private bytes",async()=>{
    const x=await setup();
    await expect(x.worker.processJob({
      jobId:"move-2",kind:"move",attemptToken:"m2",
      sourceKeys:["albums/o/a/photos/p/thumb.webp","albums/o/a/photos/p/full.webp"],
      sourceETags:["some","some"],
      targetKeys:["albums/foreign/b/photos/p/thumb.webp","albums/foreign/b/photos/p/full.webp"],
      leaseUntil:x.claim.leaseUntil,writeMode:"create-if-absent",
    },now+50_000)).rejects.toThrow();
    expect(x.objects.read).not.toHaveBeenCalled();
  });
  it("maintains at most ten durable cleanup claims in one bounded invocation",async()=>{
    const x=await setup();
    let number=0;
    vi.mocked(x.core.claimJobs).mockImplementation(async()=>[{
      jobId:`cleanup-${++number}`,kind:"delete",attemptToken:"t",
      sourceKeys:[],sourceETags:[],targetKeys:[],
      leaseUntil:x.claim.leaseUntil,writeMode:"create-if-absent",
    }]);
    await x.worker.maintenance();
    expect(x.core.claimJobs).toHaveBeenCalledTimes(10);
    expect(x.core.completeJob).toHaveBeenCalledTimes(10);
  });
  it("retries failed S3 deletes without acknowledging the job",async()=>{
    const x=await setup();
    vi.mocked(x.objects.delete).mockRejectedValueOnce(Error("S3_UNAVAILABLE"));
    await expect(x.worker.processJob({
      jobId:"cleanup",kind:"delete",attemptToken:"t",
      sourceKeys:["albums/o/a/photos/p/full.webp"],sourceETags:[],targetKeys:[],
      leaseUntil:x.claim.leaseUntil,writeMode:"create-if-absent",
    },now+50_000)).rejects.toThrow("S3_UNAVAILABLE");
    expect(x.core.failJob).toHaveBeenCalledOnce();
    expect(x.core.completeJob).not.toHaveBeenCalled();
  });
});
