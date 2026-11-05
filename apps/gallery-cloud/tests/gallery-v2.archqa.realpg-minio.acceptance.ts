/** Opt-in REAL GAFUS Gallery Core + Sharp worker + PostgreSQL + private MinIO. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import sharp from "sharp";
import { prisma } from "@gafus/prisma";
import { createGalleryService } from "@gafus/core/services/gallery";
import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryCloudWorker } from "../src/worker";
import { sharpGalleryEngine } from "../src/sharp-engine";
import type { GalleryInternalClient } from "../src/internal";

const databaseUrl = process.env.DATABASE_URL ?? "";
const s3 = process.env.GAFUS_ARCHQA_GALLERY_ENDPOINT ?? "";
const bucket = process.env.GAFUS_ARCHQA_GALLERY_BUCKET ?? "";
const guard = (() => {
  try {
    const url = new URL(databaseUrl);
    const endpoint = new URL(s3);
    return process.env.GAFUS_ARCHQA_GALLERY_REALPG === "1" &&
      url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(url.pathname.slice(1)) &&
      url.pathname.slice(1) === process.env.GAFUS_ARCHQA_DB_NAME &&
      endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1" &&
      Number(endpoint.port) > 0 &&
      /^gafus-archqa-gallery-[a-f0-9]{12}$/.test(bucket) &&
      /^qa[a-f0-9]{18}$/.test(process.env.GAFUS_ARCHQA_GALLERY_KEY ?? "") &&
      (process.env.GAFUS_ARCHQA_GALLERY_SECRET?.length ?? 0) >= 40;
  } catch { return false; }
})();
if (!guard) throw Error("GALLERY_ARCHQA_REQUIRES_FRESH_LOOPBACK_PG_AND_MINIO");
const requireSdk = createRequire(new URL("../../../packages/gallery-storage/package.json", import.meta.url));
const { S3Client, GetObjectCommand } = requireSdk("@aws-sdk/client-s3");
const { createPresignedPost } = requireSdk("@aws-sdk/s3-presigned-post");
const { getSignedUrl } = requireSdk("@aws-sdk/s3-request-presigner");
const client = new S3Client({
  endpoint: s3, region: "us-east-1", forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.GAFUS_ARCHQA_GALLERY_KEY!,
    secretAccessKey: process.env.GAFUS_ARCHQA_GALLERY_SECRET!,
  },
  maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const objects = createGalleryObjectStore({ bucket, endpoint: s3,
  accessKeyId: process.env.GAFUS_ARCHQA_GALLERY_KEY!,
  secretAccessKey: process.env.GAFUS_ARCHQA_GALLERY_SECRET!,
  isolatedNonprod: true, cacheableFinalEnabled: false,
}, client);
const storage = {
  enabled: true,
  head: objects.head,
  async presignPost(input: { key: string; expiresAt: Date; maxBytes: number; contentType: string }) {
    return createPresignedPost(client, {
      Bucket: bucket, Key: input.key, Expires: Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)),
      Fields: { "Content-Type": input.contentType, success_action_status: "204" },
      Conditions: [["content-length-range", 1, input.maxBytes],
        ["eq", "$Content-Type", input.contentType], ["eq", "$key", input.key],
        ["eq", "$success_action_status", "204"]],
    });
  },
  signCdn(input: { key: string; expiresAt: Date }) {
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: input.key,
      ResponseCacheControl: "private, no-store" }), {
      expiresIn: Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)),
    });
  },
};
const service = createGalleryService({ db: prisma, storage });
const core: GalleryInternalClient = {
  claimUpload: id => service.claimUpload({ uploadId: id }),
  completeUpload: input => service.completeUpload(input),
  failUpload: input => service.failUpload(input),
  claimJobs: (limit, uploadId) => service.claimStorageJobs({ limit, uploadId }),
  completeJob: input => service.completeStorageJob(input),
  failJob: input => service.failStorageJob(input),
  maintenance: limit => service.maintenance({ limit }),
};
const worker = createGalleryCloudWorker({ core, objects,
  queue: { async send() { /* this is a genuine one-shot Sharp worker invocation */ } },
});
const owner = randomUUID();
const ownedKeys = new Set<string>();
beforeAll(async () => {
  const actual = await prisma.$queryRawUnsafe<{ db: string }[]>("SELECT current_database() AS db");
  expect(actual[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
  await prisma.user.create({ data: { id: owner, username: `gallery_archqa_${owner}`, password: "synthetic-only" } });
});
afterAll(async () => {
  // Deleting test-owned resources is permitted; the entire instance is disposable.
  for (const key of ownedKeys) await objects.delete(key);
  await prisma.galleryStorageJob.deleteMany({ where: { ownerId: owner } });
  await prisma.user.delete({ where: { id: owner } });
  client.destroy();
  await prisma.$disconnect();
});

describe("real Gallery Cloud worker + Core transactional processing + private MinIO", () => {
  it("POST JPEG -> durable PG QUEUED -> actual Sharp worker -> atomic READY -> cleanup private S3", async () => {
    const jpeg = await sharp({ create: { width: 680, height: 480, channels: 3,
      background: "#867456" } }).jpeg().toBuffer();
    const album = await service.createAlbum(owner, { name: "Disposable QA album", isVisible: false });
    const reservation = await service.reserveUpload(owner, { albumId: album.id, filename: "synthetic.jpg",
      declaredMime: "image/jpeg", declaredBytes: jpeg.length, clientRequestId: randomUUID() });
    const persisted = await prisma.galleryUpload.findUniqueOrThrow({ where: { id: reservation.uploadId } });
    const thumb = `gallery/${owner}/media/${persisted.photoId}/v2/thumb.webp`;
    const full = `gallery/${owner}/media/${persisted.photoId}/v2/full.webp`;
    [persisted.sourceKey, thumb, full].forEach(key => ownedKeys.add(key));
    const form = new FormData();
    for (const [name, value] of Object.entries(reservation.postFields!)) form.append(name, value);
    form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "synthetic.jpg");
    const posted = await fetch(reservation.postUrl!, { method: "POST", body: form, redirect: "error" });
    expect(posted.status).toBe(204);
    await posted.body?.cancel();
    expect((await service.confirmUpload(owner, reservation.uploadId)).status).toBe("uploaded");
    const [first, duplicate] = await Promise.allSettled([
      worker.processUpload(reservation.uploadId), worker.processUpload(reservation.uploadId),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(duplicate.status).toBe("fulfilled");
    const ready = await prisma.galleryPhoto.findUniqueOrThrow({ where: { id: persisted.photoId } });
    expect(ready).toMatchObject({ status: "ready", thumbKey: thumb, fullKey: full });
    expect((await objects.head(thumb))?.contentType).toBe("image/webp");
    expect((await objects.head(full))?.contentType).toBe("image/webp");
    const signed = await storage.signCdn({ key: thumb, expiresAt: new Date(Date.now() + 60_000) });
    expect((await fetch(signed)).status).toBe(200);
    const sourceTask = await prisma.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: `source-now:${persisted.id}` },
    });
    const [claimed] = await service.claimStorageJobs({ limit: 1,
      exactDelete: { jobId: sourceTask.id, ownerId: owner } });
    expect(claimed?.kind).toBe("delete");
    await worker.processJob(claimed!, Date.now() + 50_000);
    expect(await objects.head(persisted.sourceKey)).toBeNull();
    await service.deletePhoto(owner, persisted.photoId);
    const deletion = await prisma.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: `photo:${persisted.photoId}:${album.id}` },
    });
    const [del] = await service.claimStorageJobs({ limit: 1,
      exactDelete: { jobId: deletion.id, ownerId: owner } });
    expect(del?.kind).toBe("delete");
    await worker.processJob(del!, Date.now() + 50_000);
    expect(await objects.head(thumb)).toBeNull();
    expect(await objects.head(full)).toBeNull();
    console.log("PASS REAL GALLERY_CORE_POSTGRES_MINIO_SHARP_WORKER_READY_AND_DURABLE_DELETE");
  }, 45_000);
});
