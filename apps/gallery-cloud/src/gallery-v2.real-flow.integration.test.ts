import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { PrismaClient } from "@gafus/prisma";
import { createGalleryService, enqueueGalleryAccountCleanup } from "@gafus/core/services/gallery";
import { createGalleryStorageFromEnv } from "@gafus/gallery-storage";
import { galleryStorageConfigFromEnv } from "@gafus/gallery-storage/config";
import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryCloudWorker } from "./worker";
import { sharpGalleryEngine } from "./sharp-engine";
import type { GalleryInternalClient } from "./internal";

const dbUrl = "postgresql://asmtv1@127.0.0.1:5432/gafus_gallery_v2_test_20261028";
const enabled = process.env.GALLERY_V2_REAL_FLOW_TEST === "isolated-only";
if (enabled && (process.env.GALLERY_TEST_DATABASE_URL !== dbUrl ||
    process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000"))
  throw Error("EXACT_GALLERY_V2_LOCAL_PG_AND_S3_REQUIRED");
const require = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const Prisma = require("@prisma/client").PrismaClient as new(args: {
  datasources: { db: { url: string } };
}) => PrismaClient;

(enabled ? describe : describe.skip)("Gallery V2 full real local PG + S3 transport", () => {
  const owner = randomUUID();
  const keys = new Set<string>();
  const env = {
    NODE_ENV: "development",
    GAFUS_LOCAL_ISOLATED_API: "1",
    GAFUS_ISOLATED_NONPROD_S3: "enabled",
    GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
    GALLERY_ENABLED: "true",
  };
  let db: PrismaClient;
  let service: ReturnType<typeof createGalleryService>;
  let worker: ReturnType<typeof createGalleryCloudWorker>;
  let objects: ReturnType<typeof createGalleryObjectStore>;
  beforeAll(async () => {
    db = new Prisma({ datasources: { db: { url: dbUrl } } });
    const signer = createGalleryStorageFromEnv(env);
    objects = createGalleryObjectStore(galleryStorageConfigFromEnv(env));
    service = createGalleryService({ db, storage: { ...signer, head: objects.head } });
    const internal: GalleryInternalClient = {
      claimUpload: (id) => service.claimUpload({ uploadId: id }),
      completeUpload: (input) => service.completeUpload(input),
      failUpload: (input) => service.failUpload(input),
      claimJobs: (limit, uploadId) => service.claimStorageJobs({ limit, uploadId }),
      completeJob: (input) => service.completeStorageJob(input),
      failJob: (input) => service.failStorageJob(input),
      maintenance: (limit) => service.maintenance({ limit }),
    };
    worker = createGalleryCloudWorker({
      core: internal, objects,
    });
    await db.user.create({
      data: { id: owner, username: "gallery-v2-flow-" + owner, password: "local-test-only" },
    });
  });
  afterAll(async () => {
    const cleanupErrors: string[] = [];
    if (objects) for (const key of keys) {
      try {
        await objects.delete(key);
        if (await objects.head(key)) cleanupErrors.push(key);
      } catch { cleanupErrors.push(key); }
    }
    if (db) {
      await db.galleryStorageJob.deleteMany({ where: { ownerId: owner } });
      await db.user.deleteMany({ where: { id: owner } });
      await db.$disconnect();
    }
    expect(cleanupErrors).toHaveLength(0); // no orphaned owned originals or WebPs
  });

  it("signed upload, Core HEAD, real Sharp worker, atomic READY, move and durable storage DELETE", async () => {
    const source = await sharp({
      create: { width: 1300, height: 900, channels: 3, background: "#a87f53" },
    }).jpeg().toBuffer();
    const origin = await service.createAlbum(owner, {
      name: "Gallery V2 integrated", isVisible: false,
    });
    const target = await service.createAlbum(owner, {
      name: "Gallery V2 moved", isVisible: false,
    });
    const reservation = await service.reserveUpload(owner, {
      albumId: origin.id, filename: "test.jpg",
      declaredMime: "image/jpeg", declaredBytes: source.length, clientRequestId: randomUUID(),
    });
    const persisted = await db.galleryUpload.findUniqueOrThrow({ where: { id: reservation.uploadId } });
    const final = [
      ["gallery", owner, "media", persisted.photoId, "v2", "thumb.webp"].join("/"),
      ["gallery", owner, "media", persisted.photoId, "v2", "full.webp"].join("/"),
    ];
    [persisted.sourceKey, ...final].forEach((key) => keys.add(key));
    const form = new FormData();
    for (const [name, value] of Object.entries(reservation.postFields!)) form.append(name, value);
    form.append("file", new Blob([source], { type: "image/jpeg" }), "test.jpg");
    const upload = await fetch(reservation.postUrl!, { method: "POST", body: form });
    expect(upload.ok).toBe(true);
    await upload.body?.cancel();
    expect((await service.confirmUpload(owner, reservation.uploadId)).status).toBe("uploaded");
    await worker.processUpload(reservation.uploadId);
    const ready = await db.galleryPhoto.findUniqueOrThrow({ where: { id: persisted.photoId } });
    expect(ready).toMatchObject({
      status: "ready", thumbKey: final[0], fullKey: final[1],
    });
    expect(await objects.head(final[0]!)).toMatchObject({ contentType: "image/webp" });
    expect(await objects.head(final[1]!)).toMatchObject({ contentType: "image/webp" });
    expect(await db.galleryStorageJob.count({
      where: { kind: "publish", photoId: persisted.photoId },
    })).toBe(0);
    const moved = await service.movePhoto(owner, persisted.photoId, {
      albumId: target.id, clientRequestId: randomUUID(),
    });
    expect(moved.photo.albumId).toBe(target.id);
    expect(await db.galleryStorageJob.findUniqueOrThrow({ where: { id: moved.jobId! } }))
      .toMatchObject({ kind: "move", status: "done" });

    const sourceTask = await db.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: "source-now:" + persisted.id },
    });
    const sourceJobs = await service.claimStorageJobs({
      exactDelete: { jobId: sourceTask.id, ownerId: owner }, limit: 1,
    });
    expect(sourceJobs).toHaveLength(1);
    await worker.processJob(sourceJobs[0]!, Date.now() + 50_000);
    expect(await objects.head(persisted.sourceKey)).toBeNull();

    await service.deletePhoto(owner, persisted.photoId);
    const finalTask = await db.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: "photo:" + persisted.photoId + ":" + target.id },
    });
    const deleteJobs = await service.claimStorageJobs({
      exactDelete: { jobId: finalTask.id, ownerId: owner }, limit: 1,
    });
    expect(deleteJobs).toHaveLength(1);
    await worker.processJob(deleteJobs[0]!, Date.now() + 50_000);
    expect(await objects.head(final[0]!)).toBeNull();
    expect(await objects.head(final[1]!)).toBeNull();
  }, 35000);
  it("late signed POST cannot leave a resurrected original after V2 READY", async () => {
    const album = await service.createAlbum(owner, {
      name: "Gallery V2 late POST", isVisible: false,
    });
    const bytes = await sharp({
      create: { width: 1280, height: 960, channels: 3, background: "#526b97" },
    }).jpeg().toBuffer();
    const reserved = await service.reserveUpload(owner, {
      albumId: album.id, filename: "late.jpg", declaredMime: "image/jpeg",
      declaredBytes: bytes.length, clientRequestId: randomUUID(),
    });
    const upload = await db.galleryUpload.findUniqueOrThrow({
      where: { id: reserved.uploadId },
    });
    const photoKeys = [
      ["gallery", owner, "media", upload.photoId, "v2", "thumb.webp"].join("/"),
      ["gallery", owner, "media", upload.photoId, "v2", "full.webp"].join("/"),
    ];
    [upload.sourceKey, ...photoKeys].forEach((key) => keys.add(key));
    const repost = async () => {
      const form = new FormData();
      for (const [name, value] of Object.entries(reserved.postFields!))
        form.append(name, value);
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), "late.jpg");
      const response = await fetch(reserved.postUrl!, { method: "POST", body: form });
      expect(response.ok).toBe(true);
      await response.body?.cancel();
    };
    await repost();
    await service.confirmUpload(owner, reserved.uploadId);
    await worker.processUpload(reserved.uploadId);
    expect((await db.galleryPhoto.findUniqueOrThrow({
      where: { id: upload.photoId },
    })).status).toBe("ready");
    const immediate = await db.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: "source-now:" + upload.id },
    });
    const [cleanOriginal] = await service.claimStorageJobs({
      limit: 1, exactDelete: { jobId: immediate.id, ownerId: owner },
    });
    expect(cleanOriginal?.kind).toBe("delete");
    await worker.processJob(cleanOriginal!, Date.now() + 50_000);
    expect(await objects.head(upload.sourceKey)).toBeNull();

    // A signed POST remains valid until expiry, even after the first cleanup.
    await repost();
    expect(await objects.head(upload.sourceKey)).not.toBeNull();
    const finalCleanup = await db.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: "source-final:" + upload.id },
    });
    expect(finalCleanup.status).toBe("pending");
    // Advance *only this dedicated test job* to scheduled expiry for deterministic E2E.
    await db.galleryStorageJob.update({
      where: { id: finalCleanup.id }, data: { availableAt: new Date() },
    });
    const [late] = await service.claimStorageJobs({
      limit: 1, exactDelete: { jobId: finalCleanup.id, ownerId: owner },
    });
    expect(late?.kind).toBe("delete");
    await worker.processJob(late!, Date.now() + 50_000);
    expect(await objects.head(upload.sourceKey)).toBeNull();
    expect(await objects.head(photoKeys[0]!)).not.toBeNull();
    expect(await objects.head(photoKeys[1]!)).not.toBeNull();
  }, 35000);
  it("two parallel Gallery processing calls accept distinct media; duplicate claim is ignored", async () => {
    const album = await service.createAlbum(owner, {
      name: "Gallery V2 parallel", isVisible: false,
    });
    const bytes = await sharp({
      create: { width: 900, height: 700, channels: 3, background: "#438c7c" },
    }).png().toBuffer();
    const reserveOne = async () => {
      const reservation = await service.reserveUpload(owner, {
        albumId: album.id, filename: "parallel.png",
        declaredMime: "image/png", declaredBytes: bytes.length, clientRequestId: randomUUID(),
      });
      const persisted = await db.galleryUpload.findUniqueOrThrow({
        where: { id: reservation.uploadId },
      });
      const pair = [
        ["gallery", owner, "media", persisted.photoId, "v2", "thumb.webp"].join("/"),
        ["gallery", owner, "media", persisted.photoId, "v2", "full.webp"].join("/"),
      ];
      [persisted.sourceKey, ...pair].forEach((key) => keys.add(key));
      const form = new FormData();
      for (const [name, value] of Object.entries(reservation.postFields!))
        form.append(name, value);
      form.append("file", new Blob([bytes], { type: "image/png" }), "parallel.png");
      const response = await fetch(reservation.postUrl!, { method: "POST", body: form });
      expect(response.ok).toBe(true);
      await response.body?.cancel();
      await service.confirmUpload(owner, persisted.id);
      return { persisted, pair };
    };
    const [first, second] = await Promise.all([reserveOne(), reserveOne()]);
    expect(first.persisted.photoId).not.toBe(second.persisted.photoId);
    await Promise.all([
      worker.processUpload(first.persisted.id),
      worker.processUpload(first.persisted.id),
      worker.processUpload(second.persisted.id),
    ]);
    const photos = await db.galleryPhoto.findMany({
      where: { id: { in: [first.persisted.photoId, second.persisted.photoId] } },
    });
    expect(photos).toHaveLength(2);
    expect(photos.every((photo) => photo.status === "ready")).toBe(true);
    const attempts = await db.galleryUpload.findMany({
      where: { id: { in: [first.persisted.id, second.persisted.id] } },
    });
    expect(attempts.map((upload) => upload.attempts)).toEqual([1, 1]);
    expect(await objects.head(first.pair[0]!)).not.toBeNull();
    expect(await objects.head(second.pair[0]!)).not.toBeNull();
  }, 35000);
  it("deleting a User cascades Gallery rows but durable cleanup still removes V2 WebPs from S3", async () => {
    const album = await service.createAlbum(owner, {
      name: "Gallery V2 account cleanup", isVisible: false,
    });
    const bytes = await sharp({
      create: { width: 1280, height: 853, channels: 3, background: "#874e5a" },
    }).jpeg().toBuffer();
    const reserved = await service.reserveUpload(owner, {
      albumId: album.id, filename: "account.jpg", declaredMime: "image/jpeg",
      declaredBytes: bytes.length, clientRequestId: randomUUID(),
    });
    const upload = await db.galleryUpload.findUniqueOrThrow({ where: { id: reserved.uploadId } });
    const finalKeys = [
      ["gallery", owner, "media", upload.photoId, "v2", "thumb.webp"].join("/"),
      ["gallery", owner, "media", upload.photoId, "v2", "full.webp"].join("/"),
    ];
    [upload.sourceKey, ...finalKeys].forEach((key) => keys.add(key));
    const form = new FormData();
    for (const [name, value] of Object.entries(reserved.postFields!))
      form.append(name, value);
    form.append("file", new Blob([bytes], { type: "image/jpeg" }), "account.jpg");
    const posted = await fetch(reserved.postUrl!, { method: "POST", body: form });
    expect(posted.ok).toBe(true);
    await posted.body?.cancel();
    await service.confirmUpload(owner, reserved.uploadId);
    await worker.processUpload(reserved.uploadId);
    expect(await objects.head(finalKeys[0]!)).not.toBeNull();
    expect(await objects.head(finalKeys[1]!)).not.toBeNull();

    // The exact test principal is deleted, while job snapshots survive cascade.
    await db.$transaction(async (tx) => {
      await enqueueGalleryAccountCleanup(tx, owner, new Date());
      await tx.user.delete({ where: { id: owner } });
    });
    expect(await db.galleryPhoto.count({ where: { ownerId: owner } })).toBe(0);
    const jobs = await db.galleryStorageJob.findMany({
      where: {
        ownerId: owner, kind: "delete", dedupeKey: { startsWith: "account:" },
      },
    });
    const allKeys = jobs.flatMap((job) => job.sourceKeys);
    for (const key of [upload.sourceKey, ...finalKeys])
      expect(allKeys).toContain(key);
    // Only this test-owned cleanup set is advanced, never other queue jobs.
    await db.galleryStorageJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    for (const job of jobs) {
      const claims = await service.claimStorageJobs({
        limit: 1, exactDelete: { jobId: job.id, ownerId: owner },
      });
      expect(claims).toHaveLength(1);
      await worker.processJob(claims[0]!, Date.now() + 50_000);
    }
    for (const key of [upload.sourceKey, ...finalKeys])
      expect(await objects.head(key)).toBeNull();
  }, 35000);
});
