import { describe, expect, it, vi } from "vitest";
import { createGalleryWorkerOperations } from "./worker";
import { createGalleryService } from "./service";
import { galleryPhotoV2Keys } from "./keys";
import type { GalleryContext } from "./context";
import type { GalleryDb, GalleryStoragePort } from "./ports";

const owner = "gallery_owner";
const photoId = "gallery_photo";
const albumId = "album_a";
const uploadId = "gallery_upload";
const attemptToken = "5548824b-f413-46e8-9c5f-9e0e5cb9feab";
const requestId = "5548824b-f413-46e8-9c5f-9e0e5cb9feac";
const at = new Date("2026-10-28T10:00:00Z");
const keys = galleryPhotoV2Keys(owner, photoId);
const head = { etag: '"a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"', bytes: 100, contentType: "image/webp" };

function fixture(missing: string | null = null) {
  const photo = {
    id: photoId, ownerId: owner, albumId, status: "processing",
    deletedAt: null, thumbKey: null, fullKey: null, width: null, height: null,
    reservationExpiresAt: new Date(at.getTime() + 600000),
    caption: null, createdAt: at,
  };
  const upload = {
    id: uploadId, photoId, ownerId: owner, photo,
    status: "processing", attemptToken, sourceETag: '"source"',
    sourceKey: "albums/gallery_owner/album_a/incoming/gallery_upload/source.jpg",
    stagedThumbKey: keys.thumbKey, stagedFullKey: keys.fullKey,
    postExpiresAt: new Date(at.getTime() + 600000),
    reservationExpiresAt: new Date(at.getTime() + 600000),
    leaseUntil: new Date(at.getTime() + 180000),
  };
  const tx = {
    user: { findUnique: vi.fn(async () => ({ id: owner })) },
    $queryRaw: vi.fn(async () => [{ id: owner }]),
    galleryAlbum: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        ({ id: where.id, ownerId: owner, isVisible: false })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    galleryUpload: {
      findUnique: vi.fn(async () => upload),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(upload, data); return upload;
      }),
    },
    galleryPhoto: {
      findFirst: vi.fn(async () => photo),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(photo, data); return photo;
      }),
    },
    galleryStorageJob: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: "cleanup" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async () => ({ id: "receipt_v2" })),
    },
  };
  const db = { $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
  const storage = {
    enabled: true,
    head: vi.fn(async (key: string) => key === missing ? null : { ...head }),
    signCdn: vi.fn(async ({ key }: { key: string }) => "https://cdn.test/" + key),
  };
  const ctx = { db, storage, now: () => at } as unknown as GalleryContext;
  const callback = { uploadId, attemptToken, sourceETag: upload.sourceETag, width: 1200, height: 800,
    manifest: {
      thumb: { ...head, width: 480, height: 320 },
      full: { ...head, width: 1200, height: 800 },
    },
  };
  return { ctx, tx, photo, upload, storage, callback };
}

describe("Gallery V2 Core atomic final publication", () => {
  it("HEAD verifies both final WebP variants before transitioning READY, without publish copy", async () => {
    const f = fixture();
    const worker = createGalleryWorkerOperations(f.ctx);
    await expect(worker.completeUpload(f.callback)).resolves.toEqual({ accepted: true, status: "ready" });
    expect(f.storage.head).toHaveBeenCalledTimes(2);
    expect(f.storage.head).toHaveBeenCalledWith(keys.thumbKey);
    expect(f.storage.head).toHaveBeenCalledWith(keys.fullKey);
    expect(f.tx.galleryPhoto.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ready", thumbKey: keys.thumbKey, fullKey: keys.fullKey }),
    }));
    expect(f.tx.galleryStorageJob.create).not.toHaveBeenCalled();
    const cleanup = vi.mocked(f.tx.galleryStorageJob.upsert).mock.calls;
    expect(cleanup).toHaveLength(2); // immediate and post-expiry source cleanup, no V2 final deletion
    expect(cleanup.every(([arg]) => arg.create.sourceKeys.every((key: string) => key === f.upload.sourceKey))).toBe(true);
    await expect(worker.completeUpload(f.callback)).resolves.toEqual({ accepted: true, status: "ready" });
    expect(f.storage.head).toHaveBeenCalledTimes(2); // duplicate callback reads nothing
  });
  it("rejects a mismatched V2 manifest even when both S3 final objects exist", async () => {
    const f = fixture();
    f.callback.manifest.thumb.bytes += 1;
    await expect(createGalleryWorkerOperations(f.ctx).completeUpload(f.callback))
      .rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(f.tx.galleryPhoto.update).not.toHaveBeenCalled();
  });
  it("does not publish or cleanup source when either required WebP is missing", async () => {
    const f = fixture(keys.fullKey);
    await expect(createGalleryWorkerOperations(f.ctx).completeUpload(f.callback))
      .rejects.toMatchObject({ code: "OUTPUT_MISSING" });
    expect(f.tx.galleryPhoto.update).not.toHaveBeenCalled();
    expect(f.tx.galleryStorageJob.upsert).not.toHaveBeenCalled();
  });
  it("moves a READY V2 photo by DB-only membership update with a durable receipt", async () => {
    const f = fixture();
    f.photo.status = "ready";
    f.photo.thumbKey = keys.thumbKey;
    f.photo.fullKey = keys.fullKey;
    const service = createGalleryService({
      db: f.ctx.db as GalleryDb,
      storage: f.ctx.storage as GalleryStoragePort,
      now: () => at,
    });
    const ack = await service.movePhoto(owner, photoId, {
      albumId: "album_b", clientRequestId: requestId,
    });
    expect(ack.jobId).toBe("receipt_v2");
    expect(ack.photo).toMatchObject({ albumId: "album_b", status: "ready", id: photoId });
    expect(f.tx.galleryStorageJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "done", kind: "move", photoId, ownerId: owner, destinationAlbumId: "album_b",
        sourceKeys: [keys.thumbKey, keys.fullKey],
        targetKeys: [keys.thumbKey, keys.fullKey],
      }),
    });
    expect(f.tx.galleryAlbum.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: albumId, coverPhotoId: photoId },
    }));
    expect(f.storage.head).not.toHaveBeenCalled();
    expect(f.tx.galleryPhoto.update).toHaveBeenCalledWith({
      where: { id: photoId }, data: { albumId: "album_b" },
    });
  });
  it("rejects an obsolete attempt token without HEAD or status transition", async () => {
    const f = fixture();
    const callback = { ...f.callback, attemptToken: requestId };
    await expect(createGalleryWorkerOperations(f.ctx).completeUpload(callback))
      .resolves.toEqual({ accepted: false, status: "processing" });
    expect(f.storage.head).not.toHaveBeenCalled();
    expect(f.tx.galleryPhoto.update).not.toHaveBeenCalled();
  });
});
