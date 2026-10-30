import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { createGalleryService } from "./service";
import { enqueueGalleryAccountCleanup } from "./accountCleanup";
import { galleryPhotoKeys, galleryPhotoV2Keys, gallerySourceKey, galleryAttemptKeys } from "./keys";
import type { GalleryObjectMetadata, GalleryStoragePort, GalleryStorageJobClaim } from "./ports";

// Only the explicitly supplied dedicated local URL. Never .env/DATABASE_URL or schema reset.
const url = process.env.GALLERY_TEST_DATABASE_URL;
if (url) {
  const t = new URL(url);
  if (
    !["postgresql:", "postgres:"].includes(t.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(t.hostname) ||
    !["/gafus_gallery_test_20261007", "/gafus_gallery_v2_test_20261028"].includes(t.pathname)
  )
    throw new Error("Explicit dedicated local gallery test DB required");
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => PrismaClient;
const db = url ? new Client({ datasources: { db: { url } } }) : null;
(url ? describe : describe.skip)("gallery / real local PostgreSQL", () => {
  let owner: string, viewer: string, username: string, at: Date;
  let objects: Map<string, GalleryObjectMetadata>, storage: GalleryStoragePort;
  let service: ReturnType<typeof createGalleryService>;
  beforeEach(async () => {
    at = new Date("2026-10-07T12:00:00Z");
    owner = randomUUID();
    viewer = randomUUID();
    username = `gallery-test-${owner}`;
    await db!.user.createMany({
      data: [
        { id: owner, username, password: "fixture" },
        { id: viewer, username: `gallery-test-${viewer}`, password: "fixture" },
      ],
    });
    objects = new Map();
    storage = {
      enabled: true,
      presignPost: vi.fn(async ({ key, expiresAt }) => ({
        url: "https://bucket.test",
        fields: { key, expires: expiresAt.toISOString() },
      })),
      head: vi.fn(async (key) => objects.get(key) ?? null),
      signCdn: vi.fn(
        async ({ key, expiresAt }) => `https://cdn.test/${key}?expires=${expiresAt.toISOString()}`,
      ),
    };
    service = createGalleryService({ db: db!, storage, now: () => new Date(at) });
  });
  afterEach(async () => {
    // Only the two fixture users and their jobs, never unscoped deletes/truncate/reset.
    await db!.galleryStorageJob.deleteMany({ where: { ownerId: { in: [owner, viewer] } } });
    await db!.user.deleteMany({ where: { id: { in: [owner, viewer] } } });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const advance = (ms: number) => {
    at = new Date(at.getTime() + ms);
  };
  const input = (albumId?: string) => ({
    albumId,
    filename: "untrusted.exe",
    declaredMime: "image/jpeg" as const,
    declaredBytes: 1234,
    clientRequestId: randomUUID(),
  });
  async function processing(albumId?: string) {
    const dto = await service.reserveUpload(owner, input(albumId));
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "source-v1", bytes: 1234, contentType: "image/jpeg" });
    const claim = (await service.claimUpload({ uploadId: dto.uploadId }))!;
    expect(claim).not.toBeNull();
    // Explicitly emulate a pre-cutover V1 attempt for existing legacy
    // publish/move-copy recovery scenarios. The currently issued claims
    // use direct V2 keys; keep both paths covered until migration.
    return { dto, upload, claim: await legacyClaim(claim, upload.photoId, dto.albumId) };
  }
  async function legacyClaim(
    claim: NonNullable<Awaited<ReturnType<ReturnType<typeof createGalleryService>["claimUpload"]>>>,
    photoId: string,
    albumId: string,
  ) {
    const staged = galleryAttemptKeys(owner, albumId, claim.uploadId, claim.attemptToken);
    await db!.galleryUpload.update({
      where: { id: claim.uploadId },
      data: { stagedThumbKey: staged.thumbKey, stagedFullKey: staged.fullKey },
    });
    return { ...claim, ...staged };
  }
  function copy(claim: GalleryStorageJobClaim) {
    expect(claim.writeMode).toBe("create-if-absent");
    claim.sourceKeys.forEach((key, i) => {
      const o = objects.get(key)!;
      expect(o.etag).toBe(claim.sourceETags[i]);
      if (!objects.has(claim.targetKeys[i]!)) objects.set(claim.targetKeys[i]!, { ...o });
    });
  }
  async function publish(result: Awaited<ReturnType<typeof processing>>) {
    let { claim } = result;
    if (claim.thumbKey === galleryPhotoV2Keys(owner, claim.photoId).thumbKey) {
      claim = await legacyClaim(claim, claim.photoId, result.dto.albumId);
    }
    objects.set(claim.thumbKey, {
      etag: `thumb-${claim.photoId}`,
      bytes: 300,
      contentType: "image/webp",
    });
    objects.set(claim.fullKey, {
      etag: `full-${claim.photoId}`,
      bytes: 900,
      contentType: "image/webp",
    });
    const callback = {
      uploadId: claim.uploadId,
      attemptToken: claim.attemptToken,
      sourceETag: claim.sourceETag,
      width: 1200,
      height: 800,
    };
    expect(await service.completeUpload(callback)).toEqual({
      accepted: true,
      status: "processing",
    });
    const job = (await service.claimStorageJobs({ limit: 50 })).find(
      (j) => j.kind === "publish" && j.sourceKeys[0] === claim.thumbKey,
    )!;
    expect(job).toBeDefined();
    copy(job);
    expect(
      await service.completeStorageJob({ jobId: job.jobId, attemptToken: job.attemptToken }),
    ).toEqual({ accepted: true, status: "done" });
    return {
      ...result,
      callback,
      job,
      photo: await db!.galleryPhoto.findUniqueOrThrow({ where: { id: claim.photoId } }),
    };
  }
  const ready = async (albumId?: string) => publish(await processing(albumId));

  it("V2 real PostgreSQL READY validates two final HEADs, skips publish, and moves without S3 copy", async () => {
    const album = await service.createAlbum(owner, { name: "V2 source" });
    const dest = await service.createAlbum(owner, { name: "V2 destination" });
    const dto = await service.reserveUpload(owner, input(album.id));
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "v2-source", bytes: 1024, contentType: "image/jpeg" });
    const claim = (await service.claimUpload({ uploadId: dto.uploadId }))!;
    expect(claim).not.toBeNull();
    const final = galleryPhotoV2Keys(owner, claim.photoId);
    expect([claim.thumbKey, claim.fullKey]).toEqual([final.thumbKey, final.fullKey]);
    const thumb = { etag: '"'+ 'a'.repeat(32)+'"', bytes: 140, contentType: "image/webp" as const };
    const full = { etag: '"'+ 'b'.repeat(32)+'"', bytes: 840, contentType: "image/webp" as const };
    objects.set(final.thumbKey, thumb);
    const callback = { uploadId: claim.uploadId, attemptToken: claim.attemptToken,
      sourceETag: claim.sourceETag, width: 1000, height: 800,
      manifest: {
        thumb: { ...thumb, width: 480, height: 384 },
        full: { ...full, width: 1000, height: 800 },
      },
    };
    await expect(service.completeUpload(callback)).rejects.toMatchObject({ code: "OUTPUT_MISSING" });
    expect((await db!.galleryPhoto.findUniqueOrThrow({ where: { id: claim.photoId } })).status)
      .toBe("processing");
    objects.set(final.fullKey, full);
    expect(await service.completeUpload(callback)).toEqual({ accepted: true, status: "ready" });
    expect(await service.completeUpload(callback)).toEqual({ accepted: true, status: "ready" });
    expect(await db!.galleryStorageJob.count({ where: { uploadId: claim.uploadId, kind: "publish" } }))
      .toBe(0);
    const request = { albumId: dest.id, clientRequestId: randomUUID() };
    const moved = await service.movePhoto(owner, claim.photoId, request);
    expect(moved.photo.albumId).toBe(dest.id);
    expect(moved.photo.status).toBe("ready");
    expect((await service.movePhoto(owner, claim.photoId, request)).jobId).toBe(moved.jobId);
    expect(await db!.galleryStorageJob.findUniqueOrThrow({ where: { id: moved.jobId! } }))
      .toMatchObject({ kind: "move", status: "done", targetKeys: [final.thumbKey, final.fullKey] });
    expect((await db!.galleryPhoto.findUniqueOrThrow({ where: { id: claim.photoId } })))
      .toMatchObject({ thumbKey: final.thumbKey, fullKey: final.fullKey, albumId: dest.id });
    expect(objects.has(final.thumbKey) && objects.has(final.fullKey)).toBe(true);
  });

  async function seed199(albumId: string) {
    await db!.galleryPhoto.createMany({
      data: Array.from({ length: 199 }, () => {
        const id = randomUUID();
        return {
          id,
          ownerId: owner,
          albumId,
          status: "ready" as const,
          reservationExpiresAt: at,
          ...galleryPhotoKeys(owner, albumId, id),
          width: 100,
          height: 100,
        };
      }),
    });
  }
  it("V2 retries a partial WebP write without a stale cleanup deleting READY keys", async () => {
    const album = await service.createAlbum(owner, { name: "Partial V2 retry" });
    const dto = await service.reserveUpload(owner, input(album.id));
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "source-v1", bytes: 1234, contentType: "image/jpeg" });
    const first = (await service.claimUpload({ uploadId: dto.uploadId }))!;
    const thumb = { etag: '"' + "a".repeat(32) + '"', bytes: 250, contentType: "image/webp" as const };
    const full = { etag: '"' + "b".repeat(32) + '"', bytes: 1250, contentType: "image/webp" as const };
    objects.set(first.thumbKey, thumb); // crash before full is written
    expect(await service.failUpload({
      uploadId: dto.uploadId, attemptToken: first.attemptToken,
      errorCode: "CLOUD_RETRY", retryable: true,
    })).toMatchObject({ accepted: true, status: "uploaded" });
    advance(2001);
    const second = (await service.claimUpload({ uploadId: dto.uploadId }))!;
    expect([second.thumbKey, second.fullKey]).toEqual([first.thumbKey, first.fullKey]);
    expect(second.attemptToken).not.toBe(first.attemptToken);
    objects.set(second.fullKey, full);
    const callback = {
      uploadId: dto.uploadId, attemptToken: second.attemptToken,
      sourceETag: second.sourceETag, width: 1200, height: 800,
      manifest: {
        thumb: { ...thumb, width: 480, height: 320 },
        full: { ...full, width: 1200, height: 800 },
      },
    };
    expect(await service.completeUpload(callback)).toEqual({ accepted: true, status: "ready" });
    const outstanding = await db!.galleryStorageJob.findMany({
      where: { ownerId: owner, kind: "delete", sourceKeys: { hasSome: [first.thumbKey] } },
    });
    expect(outstanding.length).toBeGreaterThanOrEqual(2);
    expect(outstanding.every((job) => job.status === "cancelled")).toBe(true);
    expect(await service.completeUpload({ ...callback, attemptToken: first.attemptToken }))
      .toMatchObject({ accepted: false });
    expect((await db!.galleryPhoto.findUniqueOrThrow({ where: { id: first.photoId } })).status)
      .toBe("ready");
  });
  it("two parallel Gallery Jobs cannot claim the same V2 photo", async () => {
    const album = await service.createAlbum(owner, { name: "Concurrent claim" });
    const dto = await service.reserveUpload(owner, input(album.id));
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, {
      etag: "immutable-source", bytes: 1234, contentType: "image/jpeg",
    });
    const [first, second] = await Promise.all([
      service.claimUpload({ uploadId: dto.uploadId }),
      service.claimUpload({ uploadId: dto.uploadId }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const persisted = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    expect(persisted).toMatchObject({ status: "processing", attempts: 1 });
    const claim = (first ?? second)!;
    expect(claim.thumbKey).toBe(galleryPhotoV2Keys(owner, upload.photoId).thumbKey);
  });
  it("five concurrent V2 uploads get five disjoint immutable final-object pairs", async () => {
    const album = await service.createAlbum(owner, { name: "Concurrent five" });
    const reserved = await Promise.all(
      Array.from({ length: 5 }, () => service.reserveUpload(owner, input(album.id))),
    );
    const uploads = await Promise.all(reserved.map((dto) =>
      db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } })));
    uploads.forEach((upload) => objects.set(upload.sourceKey, {
      etag: "source-" + upload.id, bytes: 1000, contentType: "image/jpeg",
    }));
    const claims = await Promise.all(uploads.map((upload) =>
      service.claimUpload({ uploadId: upload.id })));
    expect(claims.every(Boolean)).toBe(true);
    const keys = claims.flatMap((claim) => [claim!.thumbKey, claim!.fullKey]);
    expect(new Set(keys).size).toBe(10);
    expect(await db!.galleryUpload.count({
      where: { id: { in: uploads.map((upload) => upload.id) }, attempts: 1, status: "processing" },
    })).toBe(5);
  });
  it("199+2 concurrent reservations: one succeeds, one rejects, capacity stays 200", async () => {
    const album = await service.createAlbum(owner, { name: "Quota" });
    await seed199(album.id);
    const results = await Promise.allSettled([
      service.reserveUpload(owner, input(album.id)),
      service.reserveUpload(owner, input(album.id)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "QUOTA_EXCEEDED" },
    });
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(200);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(200);
  });
  it("no default on GET, idempotent first upload, exact source-folder keys and expiry", async () => {
    expect((await service.listAlbums(owner, { username })).items).toEqual([]);
    expect(await db!.galleryAlbum.count({ where: { ownerId: owner } })).toBe(0);
    const request = input(),
      dto = await service.reserveUpload(owner, request);
    expect(await service.reserveUpload(owner, request)).toEqual(dto);
    expect(await service.getAlbum(owner, dto.albumId)).toMatchObject({
      name: "Фотографии",
      isVisible: true,
    });
    expect(dto.postFields!.key).toBe(
      `albums/${owner}/${dto.albumId}/incoming/${dto.uploadId}/source.jpg`,
    );
    expect(gallerySourceKey(owner, dto.albumId, dto.uploadId, "image/png")).toMatch(
      /\/source.png$/,
    );
    expect(gallerySourceKey(owner, dto.albumId, dto.uploadId, "image/webp")).toMatch(
      /\/source.webp$/,
    );
    expect(galleryAttemptKeys(owner, dto.albumId, dto.uploadId, "token").thumbKey).toBe(
      `albums/${owner}/${dto.albumId}/incoming/${dto.uploadId}/attempts/token/thumb.webp`,
    );
    expect(galleryPhotoKeys(owner, dto.albumId, dto.photo!.id).fullKey).toBe(
      `albums/${owner}/${dto.albumId}/photos/${dto.photo!.id}/full.webp`,
    );
    expect(new Date(dto.expiresAt!).getTime() - at.getTime()).toBe(600_000);
    expect(new Date(dto.reservationExpiresAt).getTime() - at.getTime()).toBe(900_000);
    expect(() => galleryPhotoKeys("../bad", "album", "photo")).toThrow();
    await expect(
      service.reserveUpload(owner, { ...request, declaredBytes: 1 }),
    ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
  });
  it("concurrent identical clientRequestId creates exactly one upload, photo, default album and cleanup job", async () => {
    const request = input();
    const [first, second] = await Promise.all([
      service.reserveUpload(owner, request),
      service.reserveUpload(owner, { ...request }),
    ]);
    expect(second).toEqual(first);
    expect(await service.reserveUpload(owner, request)).toEqual(first);
    expect(await db!.galleryUpload.count({ where: { ownerId: owner, clientRequestId: request.clientRequestId } })).toBe(1);
    expect(await db!.galleryUpload.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryAlbum.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: owner, kind: "delete" } })).toBe(1);
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(1);
    expect((await db!.galleryUpload.findUniqueOrThrow({ where: { id: first.uploadId } })).photoId).toBe(first.photo!.id);
  });

  it("concurrent changed payload under one clientRequestId returns 409 without orphan photo, upload or job", async () => {
    const album = await service.createAlbum(owner, { name: "Concurrent fingerprint" });
    const original = input(album.id);
    const changed = { ...original, declaredBytes: original.declaredBytes + 1 };
    const results = await Promise.allSettled([
      service.reserveUpload(owner, original),
      service.reserveUpload(owner, changed),
    ]);
    const accepted = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ index, dto: result.value }] : [],
    );
    const denied = results.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ reason: { code: "REQUEST_CONFLICT", status: 409 } });
    const successfulInput = accepted[0]!.index === 0 ? original : changed;
    const winningDto = accepted[0]!.dto;
    const persisted = await db!.galleryUpload.findUniqueOrThrow({ where: { id: winningDto.uploadId } });
    expect(persisted.clientRequestId).toBe(original.clientRequestId);
    expect(persisted.declaredBytes).toBe(successfulInput.declaredBytes);
    expect(await service.reserveUpload(owner, successfulInput)).toEqual(winningDto);
    await expect(service.reserveUpload(owner, accepted[0]!.index === 0 ? changed : original))
      .rejects.toMatchObject({ code: "REQUEST_CONFLICT", status: 409 });
    expect(await db!.galleryUpload.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryAlbum.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: owner, kind: "delete" } })).toBe(1);
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(1);
  });

  it("same clientRequestId is owner-scoped and foreign upload read/retry remains denied", async () => {
    const albumA = await service.createAlbum(owner, { name: "Owner A", isVisible: false });
    const albumB = await service.createAlbum(viewer, { name: "Owner B", isVisible: false });
    const requestA = input(albumA.id);
    const requestB = { ...input(albumB.id), clientRequestId: requestA.clientRequestId };
    const [a, b] = await Promise.all([
      service.reserveUpload(owner, requestA),
      service.reserveUpload(viewer, requestB),
    ]);
    expect(a.uploadId).not.toBe(b.uploadId);
    expect(await db!.galleryUpload.count({ where: { ownerId: owner, clientRequestId: requestA.clientRequestId } })).toBe(1);
    expect(await db!.galleryUpload.count({ where: { ownerId: viewer, clientRequestId: requestA.clientRequestId } })).toBe(1);
    await expect(service.getUpload(viewer, a.uploadId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(service.getUpload(owner, b.uploadId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(service.retryUpload(viewer, a.uploadId, { clientRequestId: randomUUID() }))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await db!.galleryUpload.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryUpload.count({ where: { ownerId: viewer } })).toBe(1);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryPhoto.count({ where: { ownerId: viewer } })).toBe(1);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: viewer } })).toBe(1);
  });
  it("cursor pages are stable newest-first and do not leak a hidden album", async () => {
    await service.createAlbum(owner, { name: "Old" });
    advance(1000);
    await service.createAlbum(owner, { name: "Hidden", isVisible: false });
    advance(1000);
    await service.createAlbum(owner, { name: "New" });
    const first = await service.listAlbums(owner, { username, pageSize: 2 });
    expect(first.items.map((a) => a.name)).toEqual(["New", "Hidden"]);
    const second = await service.listAlbums(owner, {
      username,
      pageSize: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((a) => a.name)).toEqual(["Old"]);
    expect(second.nextCursor).toBeNull();
    expect((await service.listAlbums(viewer, { username })).items.map((a) => a.name)).toEqual([
      "New",
      "Old",
    ]);
    await expect(service.listAlbums(owner, { username, cursor: "invalid" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
  it("signer failure rolls back upload, quota, photo and album; same request ID can safely retry", async () => {
    const request = input();
    vi.mocked(storage.presignPost).mockRejectedValueOnce(new Error("signer down"));
    await expect(service.reserveUpload(owner, request)).rejects.toThrow("signer down");
    expect(await db!.galleryAlbum.count({ where: { ownerId: owner } })).toBe(0);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(0);
    expect(await db!.galleryUpload.count({ where: { ownerId: owner, clientRequestId: request.clientRequestId } })).toBe(0);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: owner } })).toBe(0);
    const retried = await service.reserveUpload(owner, request);
    expect(retried.status).toBe("reserved");
    expect(await db!.galleryAlbum.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(1);
    expect(await db!.galleryUpload.count({ where: { ownerId: owner, clientRequestId: request.clientRequestId } })).toBe(1);
    expect(await db!.galleryStorageJob.count({ where: { ownerId: owner } })).toBe(1);
  });
  it("returns localized processing failure and uploadId only to the owner after refresh", async () => {
    const r = await processing();
    await service.failUpload({
      uploadId: r.upload.id,
      attemptToken: r.claim.attemptToken,
      errorCode: "OUTPUT_TOO_LARGE",
      retryable: false,
    });
    const failure = {
      uploadId: r.upload.id,
      errorCode: "OUTPUT_TOO_LARGE",
      errorMessage: "Изображение слишком большое после обработки. Попробуйте другое фото",
    };
    const upload = await service.getUpload(owner, r.upload.id);
    expect(upload).toMatchObject({ ...failure, status: "failed", photo: failure });
    expect(await service.getPhoto(owner, r.claim.photoId)).toMatchObject({
      ...failure,
      status: "failed",
    });
    expect((await service.listPhotos(owner, { albumId: r.dto.albumId })).items).toEqual([
      expect.objectContaining(failure),
    ]);
    await expect(service.getUpload(viewer, r.upload.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.getPhoto(viewer, r.claim.photoId)).rejects.toMatchObject({ status: 404 });
    expect((await service.listPhotos(viewer, { albumId: r.dto.albumId })).items).toEqual([]);

    const published = await ready(r.dto.albumId);
    const privateFields = { uploadId: null, errorCode: null, errorMessage: null };
    expect(await service.getPhoto(viewer, published.photo.id)).toMatchObject(privateFields);
    expect((await service.listPhotos(viewer, { albumId: r.dto.albumId })).items).toEqual([
      expect.objectContaining(privateFields),
    ]);
    expect(await service.getPhoto(owner, published.photo.id)).toMatchObject({
      ...privateFields,
      uploadId: published.upload.id,
    });

    const unknown = await processing(r.dto.albumId);
    await service.failUpload({
      uploadId: unknown.upload.id,
      attemptToken: unknown.claim.attemptToken,
      errorCode: "PROVIDER_RAW_SECRET_DETAIL",
      retryable: false,
    });
    const safeFailure = {
      errorCode: "PROCESSING_FAILED",
      errorMessage: "Не удалось обработать фото. Повторите загрузку",
    };
    expect(await service.getUpload(owner, unknown.upload.id)).toMatchObject(safeFailure);
    expect(await service.getPhoto(owner, unknown.claim.photoId)).toMatchObject(safeFailure);
  });
  it("2-actor privacy and IDOR, visible mutations denied and pending owner-only", async () => {
    const album = await service.createAlbum(owner, { name: "Hidden", isVisible: false }),
      r = await ready(album.id);
    expect((await service.listAlbums(viewer, { username })).items).toEqual([]);
    for (const action of [
      () => service.getAlbum(viewer, album.id),
      () => service.getPhoto(viewer, r.photo.id),
      () => service.listPhotos(viewer, { albumId: album.id }),
      () => service.getUpload(viewer, r.upload.id),
      () => service.confirmUpload(viewer, r.upload.id),
      () => service.retryUpload(viewer, r.upload.id, { clientRequestId: randomUUID() }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.mocked(storage.signCdn).mockClear();
    await expect(service.getPhoto(viewer, r.photo.id)).rejects.toMatchObject({ status: 404 });
    expect(storage.signCdn).not.toHaveBeenCalled();
    await service.updateAlbum(owner, album.id, { isVisible: true });
    await service.reserveUpload(owner, input(album.id));
    expect((await service.listPhotos(viewer, { albumId: album.id })).items).toHaveLength(1);
    expect((await service.listPhotos(owner, { albumId: album.id })).items).toHaveLength(2);
    for (const action of [
      () => service.updateAlbum(viewer, album.id, { name: "stolen" }),
      () => service.updatePhoto(viewer, r.photo.id, { caption: "stolen" }),
      () => service.deletePhoto(viewer, r.photo.id),
      () => service.deleteAlbum(viewer, album.id),
      () => service.setCover(viewer, album.id, { photoId: r.photo.id }),
      () =>
        service.movePhoto(viewer, r.photo.id, { albumId: album.id, clientRequestId: randomUUID() }),
      () => service.reserveUpload(viewer, input(album.id)),
    ])
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.listAlbums("", { username })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const dto = await service.getPhoto(viewer, r.photo.id);
    expect(dto.canEdit).toBe(false);
    expect(JSON.stringify(dto)).not.toContain("sourceKey");
    expect(new Date(dto.urlsExpireAt!).getTime() - at.getTime()).toBeGreaterThanOrEqual(270_000);
    expect(new Date(dto.urlsExpireAt!).getTime() - at.getTime()).toBeLessThanOrEqual(300_000);
  });
  it("duplicate events/callbacks, conflicting replay, READY immutability", async () => {
    const r = await ready();
    expect(await service.claimUpload({ uploadId: r.upload.id })).toBeNull();
    expect(await service.completeUpload(r.callback)).toEqual({ accepted: true, status: "ready" });
    await expect(service.completeUpload({ ...r.callback, width: 999 })).rejects.toMatchObject({
      code: "CALLBACK_CONFLICT",
    });
    expect(
      await service.completeUpload({ ...r.callback, attemptToken: randomUUID() }),
    ).toMatchObject({ accepted: false });
    expect(
      await service.completeStorageJob({ jobId: r.job.jobId, attemptToken: r.job.attemptToken }),
    ).toEqual({ accepted: true, status: "done" });
    expect(
      await service.failUpload({
        uploadId: r.upload.id,
        attemptToken: r.claim.attemptToken,
        errorCode: "LATE",
        retryable: false,
      }),
    ).toMatchObject({ accepted: false });
    expect(
      await db!.galleryStorageJob.count({ where: { uploadId: r.upload.id, kind: "publish" } }),
    ).toBe(1);
    expect(await db!.galleryPhoto.findUnique({ where: { id: r.photo.id } })).toEqual(r.photo);
  });
  it("active lease crossing original reservation keeps slot and permits valid publication", async () => {
    const album = await service.createAlbum(owner, { name: "Lease" });
    await seed199(album.id);
    const dto = await service.reserveUpload(owner, input(album.id)),
      upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "source-v1", bytes: 1234, contentType: "image/jpeg" });
    advance(899_000);
    const claim = (await service.claimUpload({ uploadId: dto.uploadId }))!;
    expect(new Date(claim.leaseUntil).getTime() - at.getTime()).toBe(120_000);
    advance(2000);
    await service.maintenance();
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(200);
    await expect(service.reserveUpload(owner, input(album.id))).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
    await publish({ dto, upload, claim });
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(200);
  });
  it("active publication lease crossing its current deadline keeps quota protected", async () => {
    const album = await service.createAlbum(owner, { name: "Publish lease" });
    await seed199(album.id);
    const r = await processing(album.id);
    objects.set(r.claim.thumbKey, { etag: "thumb", bytes: 100, contentType: "image/webp" });
    objects.set(r.claim.fullKey, { etag: "full", bytes: 300, contentType: "image/webp" });
    await service.completeUpload({
      uploadId: r.upload.id,
      attemptToken: r.claim.attemptToken,
      sourceETag: r.claim.sourceETag,
      width: 100,
      height: 100,
    });
    advance(899_000);
    const job = (await service.claimStorageJobs({ limit: 50 })).find((j) => j.kind === "publish")!;
    advance(2000);
    await service.maintenance();
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(200);
    await expect(service.reserveUpload(owner, input(album.id))).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
    copy(job);
    expect(
      await service.completeStorageJob({ jobId: job.jobId, attemptToken: job.attemptToken }),
    ).toMatchObject({ accepted: true });
  });
  it("source rewritten after READY is removed by final timer cleanup after POST expiry", async () => {
    const r = await ready();
    const immediate = (await service.claimStorageJobs({ limit: 50 })).filter(
      (j) => j.kind === "delete",
    );
    for (const job of immediate) {
      job.sourceKeys.forEach((k) => objects.delete(k));
      await service.completeStorageJob({ jobId: job.jobId, attemptToken: job.attemptToken });
    }
    expect(objects.has(r.upload.sourceKey)).toBe(false);
    advance(599_000);
    objects.set(r.upload.sourceKey, { etag: "rewritten", bytes: 300, contentType: "image/jpeg" });
    advance(62_000);
    const finals = await service.claimStorageJobs({ limit: 50 });
    const final = finals.find(
      (j) => j.kind === "delete" && j.sourceKeys.includes(r.upload.sourceKey),
    )!;
    expect(final).toBeDefined();
    final.sourceKeys.forEach((k) => objects.delete(k));
    await service.completeStorageJob({ jobId: final.jobId, attemptToken: final.attemptToken });
    expect(objects.has(r.upload.sourceKey)).toBe(false);
    expect(objects.has(r.photo.thumbKey!)).toBe(true);
  });
  it("processing attempts are bounded and superseded callback cannot publish", async () => {
    const r = await processing();
    advance(120_001);
    await service.maintenance();
    const second = (await service.claimUpload({ uploadId: r.upload.id }))!;
    expect(second.attemptToken).not.toBe(r.claim.attemptToken);
    expect(
      await service.completeUpload({
        uploadId: r.upload.id,
        attemptToken: r.claim.attemptToken,
        sourceETag: r.claim.sourceETag,
        width: 100,
        height: 100,
      }),
    ).toMatchObject({ accepted: false });
    advance(120_001);
    await service.maintenance();
    expect(await service.claimUpload({ uploadId: r.upload.id })).not.toBeNull();
    advance(120_001);
    await service.maintenance();
    expect(await service.claimUpload({ uploadId: r.upload.id })).toBeNull();
    expect((await service.getUpload(owner, r.upload.id)).status).toBe("failed");
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(0);
  });
  it("maintenance recovers a lost bucket event without adapter DB queries", async () => {
    const dto = await service.reserveUpload(owner, input());
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "event-lost", bytes: 1234, contentType: "image/jpeg" });
    expect((await service.maintenance()).processUploadIds).toContain(dto.uploadId);
    expect((await service.claimUpload({ uploadId: dto.uploadId }))?.sourceETag).toBe("event-lost");
  });
  it("expired unclaimed upload releases slot and cannot process", async () => {
    const dto = await service.reserveUpload(owner, input());
    advance(900_001);
    expect(await service.claimUpload({ uploadId: dto.uploadId })).toBeNull();
    expect(await service.getUpload(owner, dto.uploadId)).toMatchObject({
      status: "expired",
      postFields: null,
    });
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(0);
  });
  it("cancel/delete invalidate callbacks and prevent signing; source final cleanup retained", async () => {
    const r = await processing();
    expect((await service.cancelUpload(owner, r.upload.id)).status).toBe("cancelled");
    expect((await service.cancelUpload(owner, r.upload.id)).status).toBe("cancelled");
    expect(
      await service.completeUpload({
        uploadId: r.upload.id,
        attemptToken: r.claim.attemptToken,
        sourceETag: r.claim.sourceETag,
        width: 100,
        height: 100,
      }),
    ).toMatchObject({ accepted: false });
    expect((await service.listAlbums(owner, { username })).usedSlots).toBe(0);
    const complete = await ready(r.dto.albumId);
    await service.setCover(owner, complete.dto.albumId, { photoId: complete.photo.id });
    await service.deletePhoto(owner, complete.photo.id);
    await expect(service.getPhoto(owner, complete.photo.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await service.getAlbum(owner, complete.dto.albumId)).coverPhotoId).toBeNull();
    const final = await db!.galleryStorageJob.findUniqueOrThrow({
      where: { dedupeKey: `source-final:${r.upload.id}` },
    });
    expect(final.sourceKeys).toContain(r.upload.sourceKey);
    expect(final.availableAt.getTime()).toBeGreaterThanOrEqual(r.upload.postExpiresAt.getTime());
  });
  it("failed move preserves source; cover requires READY in same album; deleted destination cancels", async () => {
    const r = await ready(),
      target = await service.createAlbum(owner, { name: "Target" }),
      pending = await service.reserveUpload(owner, input(target.id));
    for (const photoId of [pending.photo!.id, r.photo.id])
      await expect(service.setCover(owner, target.id, { photoId })).rejects.toMatchObject({
        code: "INVALID_COVER",
      });
    const request = { albumId: target.id, clientRequestId: randomUUID() },
      moved = await service.movePhoto(owner, r.photo.id, request);
    expect((await service.movePhoto(owner, r.photo.id, request)).jobId).toBe(moved.jobId);
    const claim = (await service.claimStorageJobs({ limit: 50 })).find(
      (j) => j.jobId === moved.jobId,
    )!;
    objects.set(claim.targetKeys[0]!, { ...objects.get(claim.sourceKeys[0]!)! });
    await expect(
      service.completeStorageJob({ jobId: claim.jobId, attemptToken: claim.attemptToken }),
    ).rejects.toMatchObject({ code: "OUTPUT_MISSING" });
    expect((await service.getPhoto(owner, r.photo.id)).albumId).toBe(r.photo.albumId);
    await service.failStorageJob({
      jobId: claim.jobId,
      attemptToken: claim.attemptToken,
      errorCode: "COPY_FAILED",
      retryable: false,
    });
    expect(await db!.galleryPhoto.findUnique({ where: { id: r.photo.id } })).toMatchObject({
      albumId: r.photo.albumId,
      status: "ready",
      thumbKey: r.photo.thumbKey,
    });
    expect(objects.has(r.photo.thumbKey!)).toBe(true);
    const second = await service.movePhoto(owner, r.photo.id, {
        albumId: target.id,
        clientRequestId: randomUUID(),
      }),
      secondClaim = (await service.claimStorageJobs({ limit: 50 })).find(
        (j) => j.jobId === second.jobId,
      )!;
    await service.deleteAlbum(owner, target.id);
    copy(secondClaim);
    expect(
      await service.completeStorageJob({
        jobId: secondClaim.jobId,
        attemptToken: secondClaim.attemptToken,
      }),
    ).toMatchObject({ accepted: false });
    expect((await service.getPhoto(owner, r.photo.id)).albumId).toBe(r.photo.albumId);
  });
  it("move back cannot recreate keys while an old cleanup is in flight", async () => {
    const r = await ready(),
      target = await service.createAlbum(owner, { name: "Move" }),
      moved = await service.movePhoto(owner, r.photo.id, {
        albumId: target.id,
        clientRequestId: randomUUID(),
      });
    const claim = (await service.claimStorageJobs({ limit: 50 })).find(
      (j) => j.jobId === moved.jobId,
    )!;
    copy(claim);
    await service.completeStorageJob({ jobId: claim.jobId, attemptToken: claim.attemptToken });
    const cleaning = (await service.claimStorageJobs({ limit: 50 })).find(
      (j) => j.kind === "delete" && j.sourceKeys.includes(r.photo.thumbKey!),
    )!;
    expect(cleaning).toBeDefined();
    await expect(
      service.movePhoto(owner, r.photo.id, {
        albumId: r.photo.albumId,
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "STORAGE_BUSY" });
    cleaning.sourceKeys.forEach((k) => objects.delete(k));
    await service.completeStorageJob({
      jobId: cleaning.jobId,
      attemptToken: cleaning.attemptToken,
    });
    const back = await service.movePhoto(owner, r.photo.id, {
        albumId: r.photo.albumId,
        clientRequestId: randomUUID(),
      }),
      backClaim = (await service.claimStorageJobs({ limit: 50 })).find(
        (j) => j.jobId === back.jobId,
      )!;
    copy(backClaim);
    await service.completeStorageJob({
      jobId: backClaim.jobId,
      attemptToken: backClaim.attemptToken,
    });
    expect((await service.getPhoto(owner, r.photo.id)).albumId).toBe(r.photo.albumId);
    advance(200_000);
    expect(
      (await service.claimStorageJobs({ limit: 50 })).some(
        (j) => j.kind === "delete" && j.sourceKeys.includes(r.photo.thumbKey!),
      ),
    ).toBe(false);
  });
  it("account cleanup survives cascade, invalidates callbacks, remains callable disabled", async () => {
    const r = await ready(),
      active = await processing(r.dto.albumId),
      target = await service.createAlbum(owner, { name: "Target" }),
      moved = await service.movePhoto(owner, r.photo.id, {
        albumId: target.id,
        clientRequestId: randomUUID(),
      });
    const claim = (await service.claimStorageJobs({ limit: 50 })).find(
      (j) => j.jobId === moved.jobId,
    )!;
    await db!.$transaction(async (tx) => {
      await enqueueGalleryAccountCleanup(tx, owner, at);
      await tx.user.delete({ where: { id: owner } });
    });
    expect(await db!.galleryPhoto.count({ where: { ownerId: owner } })).toBe(0);
    const jobs = await db!.galleryStorageJob.findMany({
      where: { ownerId: owner, kind: "delete" },
    });
    expect(jobs.flatMap((j) => j.sourceKeys)).toEqual(
      expect.arrayContaining([
        r.photo.thumbKey!,
        r.photo.fullKey!,
        active.claim.sourceKey,
        active.claim.thumbKey,
        ...claim.targetKeys,
      ]),
    );
    expect(
      await service.completeUpload({
        uploadId: active.upload.id,
        attemptToken: active.claim.attemptToken,
        sourceETag: active.claim.sourceETag,
        width: 100,
        height: 100,
      }),
    ).toMatchObject({ accepted: false });
    copy(claim);
    expect(
      await service.completeStorageJob({ jobId: claim.jobId, attemptToken: claim.attemptToken }),
    ).toMatchObject({ accepted: false });
    storage.enabled = false;
    advance(1_000_000);
    const claims = await service.claimStorageJobs({ limit: 50 });
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      expect(c.kind).toBe("delete");
      c.sourceKeys.forEach((k) => objects.delete(k));
      expect(
        await service.completeStorageJob({ jobId: c.jobId, attemptToken: c.attemptToken }),
      ).toMatchObject({ accepted: true });
    }
  });
  it("recovers exhausted DELETE after one hour, bounded and disabled after account deletion", async () => {
    const dto = await service.reserveUpload(owner, input());
    const upload = await db!.galleryUpload.findUniqueOrThrow({ where: { id: dto.uploadId } });
    objects.set(upload.sourceKey, { etag: "leftover", bytes: 1234, contentType: "image/jpeg" });
    await db!.$transaction(async (tx) => {
      await enqueueGalleryAccountCleanup(tx, owner, at);
      await tx.user.delete({ where: { id: owner } });
    });
    storage.enabled = false;
    const job = await db!.galleryStorageJob.findFirstOrThrow({
      where: { ownerId: owner, kind: "delete", dedupeKey: { startsWith: "account:" } },
    });
    // Account cleanup must respect the original upload reservation and active lease.
    // The previous hard-coded 700_000ms could be earlier than the job availableAt.
    at = new Date(Math.max(at.getTime() + 700_000, job.availableAt.getTime() + 1000));
    let lastToken = "";
    for (let attempt = 1; attempt <= 5; attempt++) {
      const claim = (await service.claimStorageJobs({ limit: 50 })).find(
        (c) => c.jobId === job.id,
      )!;
      expect(claim).toBeDefined();
      lastToken = claim.attemptToken;
      expect(
        await service.failStorageJob({
          jobId: job.id,
          attemptToken: lastToken,
          errorCode: "STORAGE_UNAVAILABLE",
          retryable: true,
        }),
      ).toEqual({ accepted: true, status: attempt < 5 ? "pending" : "failed" });
      if (attempt < 5) advance(30_000);
    }
    const failed = await db!.galleryStorageJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed).toMatchObject({
      status: "failed",
      attempts: 5,
      errorCode: "STORAGE_UNAVAILABLE",
    });
    // Use the persisted failure timestamp for the injected clock's cooldown boundary.
    at = new Date(failed.updatedAt);
    const additionalIds = [randomUUID(), randomUUID(), randomUUID()];
    await db!.galleryStorageJob.createMany({
      data: additionalIds.map((id, i) => ({
        id,
        dedupeKey: `recovery-fixture:${id}`,
        ownerId: owner,
        kind: (["delete", "move", "publish"] as const)[i]!,
        status: "failed" as const,
        sourceKeys: [`fixture/${id}`],
        sourceETags: [],
        targetKeys: [],
        attempts: 5,
        availableAt: at,
        updatedAt: new Date(at.getTime() + 1),
        errorCode: "PREVIOUS_FAILURE",
      })),
    });
    advance(3_599_999);
    expect((await service.maintenance({ limit: 1 })).recoveredCleanupJobs).toBe(0);
    advance(2000);
    expect((await service.maintenance({ limit: 1 })).recoveredCleanupJobs).toBe(1);
    expect(await db!.galleryStorageJob.findUnique({ where: { id: job.id } })).toMatchObject({
      status: "pending",
      attempts: 0,
      leaseUntil: null,
      attemptToken: null,
      availableAt: at,
      errorCode: "STORAGE_UNAVAILABLE",
    });
    expect(
      await db!.galleryStorageJob.count({ where: { id: { in: additionalIds }, status: "failed" } }),
    ).toBe(3);
    expect(
      await service.completeStorageJob({ jobId: job.id, attemptToken: lastToken }),
    ).toMatchObject({ accepted: false });
    const claim = (await service.claimStorageJobs({ limit: 50 })).find((c) => c.jobId === job.id)!;
    expect(claim.attemptToken).not.toBe(lastToken);
    claim.sourceKeys.forEach((key) => objects.delete(key));
    expect(
      await service.completeStorageJob({ jobId: job.id, attemptToken: claim.attemptToken }),
    ).toEqual({ accepted: true, status: "done" });
    expect(objects.has(upload.sourceKey)).toBe(false);
  });
  it("immutable source ETag across processing retries and idempotent fresh user retry", async () => {
    const r = await processing();
    await service.failUpload({
      uploadId: r.upload.id,
      attemptToken: r.claim.attemptToken,
      errorCode: "TEMPORARY",
      retryable: true,
    });
    advance(3000);
    objects.set(r.claim.sourceKey, { etag: "v2", bytes: 50, contentType: "image/jpeg" });
    expect(await service.claimUpload({ uploadId: r.upload.id })).toBeNull();
    expect((await service.getUpload(owner, r.upload.id)).status).toBe("failed");
    const request = { clientRequestId: randomUUID() },
      retry = await service.retryUpload(owner, r.upload.id, request);
    expect(await service.retryUpload(owner, r.upload.id, request)).toEqual(retry);
    expect(retry.photo!.id).not.toBe(r.claim.photoId);
    expect(retry.postFields!.key).not.toBe(r.claim.sourceKey);
    await expect(
      service.retryUpload(owner, r.upload.id, { clientRequestId: randomUUID() }),
    ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
  });
  it("disabled empty wrapper + errors, each owner account must exist", async () => {
    const album = await service.createAlbum(owner, { name: "Enabled" });
    storage.enabled = false;
    expect(await service.listAlbums(owner, { username })).toMatchObject({
      enabled: false,
      items: [],
    });
    await expect(service.getAlbum(owner, album.id)).rejects.toMatchObject({
      code: "GALLERY_DISABLED",
    });
    await expect(service.reserveUpload(owner, input())).rejects.toMatchObject({
      code: "GALLERY_DISABLED",
    });
    storage.enabled = true;
    await expect(service.createAlbum("", { name: "missing" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(service.createAlbum(randomUUID(), { name: "missing" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
