import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createFeedService } from "./service";
import type { FeedDb, FeedStoragePort } from "./ports";

/** No real database or storage: validate the transactional cleanup schedule. */
describe("Feed S3 upload cancellation cleanup", () => {
  it("defers deleting an incoming key until both the signed POST and reservation expire", async () => {
    const now = new Date("2026-10-26T10:00:00Z");
    let status = "reserved";
    const upload = {
      id: "upload-1", ownerId: "owner-1", postId: "post-1", mediaId: "media-1",
      declaredMime: "image/jpeg", sourceKey: "posts/owner-1/post-1/incoming/upload-1/source.jpg",
      postExpiresAt: new Date(now.getTime() + 600_000),
      reservationExpiresAt: new Date(now.getTime() + 900_000),
      leaseUntil: null, errorCode: null,
    };
    const load = vi.fn(async () => ({ ...upload, status }));
    const createCleanup = vi.fn().mockResolvedValue(undefined);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "post-1" }]),
      feedUpload: {
        findUnique: load,
        update: vi.fn(async ({ data }: { data: { status: string } }) => { status = data.status; }),
      },
      feedMediaAsset: { update: vi.fn().mockResolvedValue(undefined) },
      feedStorageJob: { create: createCleanup },
    };
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "owner-1" }) },
      feedUpload: { findFirst: load },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as FeedDb;
    const storage = { enabled: true } as FeedStoragePort;
    const feed = createFeedService({ db, storage, now: () => now, enabled: () => true });
    const outcome = await feed.cancelUpload("owner-1", "upload-1");
    expect(outcome.status).toBe("cancelled");
    const payload = createCleanup.mock.calls[0]?.[0].data;
    expect(payload).toMatchObject({
      kind: "delete_keys", sourceKeys: [upload.sourceKey],
      ownerId: upload.ownerId, postId: upload.postId,
    });
    expect(payload.availableAt).toEqual(new Date(upload.reservationExpiresAt.getTime() + 60_000));
    expect(payload.availableAt.getTime()).toBeGreaterThan(upload.postExpiresAt.getTime());
  });

  it.each([
    { name: "signed URL expired with no original", head: null,
      expected: "expired", job: "delete_keys" },
    { name: "signed URL expired but POST succeeded; Complete ACK lost",
      head: { etag: "etag-confirmed", bytes: 100, contentType: "image/jpeg" },
      expected: "uploaded", job: "publish_photo" },
    { name: "object has incorrect byte length",
      head: { etag: "invalid-etag", bytes: 101, contentType: "image/jpeg" },
      expected: "expired", job: "delete_keys" },
    { name: "S3 HEAD unavailable: never delete an unknown original",
      head: "error", expected: "reserved", job: "none" },
  ])("recovers safely: $name", async ({ head, expected, job }) => {
    const now = new Date("2026-10-26T10:11:00Z");
    const input = {
      clientRequestId: "d31e10b6-449a-462e-b7a4-61d377a91ad6",
      filename: "dog.jpg", kind: "photo" as const,
      declaredMime: "image/jpeg" as const, declaredBytes: 100,
    };
    const fingerprint = createHash("sha256").update(JSON.stringify({
      postId: "post-1", kind: input.kind, declaredMime: input.declaredMime,
      declaredBytes: input.declaredBytes, filename: input.filename,
    })).digest("hex");
    const row = {
      id: "upload-1", ownerId: "owner-1", postId: "post-1", mediaId: "media-1",
      requestFingerprint: fingerprint, sourceKey: "posts/owner-1/post-1/incoming/upload-1/source.jpg",
      declaredMime: input.declaredMime, declaredBytes: input.declaredBytes,
      filename: input.filename, errorCode: null,
      postExpiresAt: new Date(now.getTime() - 60_000),
      reservationExpiresAt: new Date(now.getTime() + 240_000),
      leaseUntil: null,
    };
    let status = "reserved";
    const createJob = vi.fn().mockResolvedValue(undefined);
    const updateUpload = vi.fn(async ({ data }: { data: { status: string } }) => {
      status = data.status;
    });
    const updateMedia = vi.fn().mockResolvedValue(undefined);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "post-1" }]),
      feedPost: { findFirst: vi.fn().mockResolvedValue({
        id: "post-1", authorId: "owner-1", moderationState: "visible",
        deletedAt: null, publishedAt: null,
      }) },
      feedUpload: {
        findUnique: vi.fn(async () => ({ ...row, status })), update: updateUpload,
      },
      feedMediaAsset: { update: updateMedia },
      feedStorageJob: { create: createJob },
    };
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "owner-1" }) },
      feedUpload: { findUnique: vi.fn(async () => ({ ...row, status })) },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as FeedDb;
    const storage = { enabled: true,
      head: head === "error" ? vi.fn().mockRejectedValue(Error("SIMULATED_S3_HEAD_503"))
        : vi.fn().mockResolvedValue(head),
      presignPost: vi.fn() } as unknown as FeedStoragePort;
    const feed = createFeedService({ db, storage, now: () => now, enabled: () => true });
    if (head === "error") {
      await expect(feed.reserveUpload("owner-1", "post-1", input))
        .rejects.toMatchObject({ status: 503 });
      expect(updateUpload).not.toHaveBeenCalled();
      expect(updateMedia).not.toHaveBeenCalled();
      expect(createJob).not.toHaveBeenCalled();
      return;
    }
    const first = await feed.reserveUpload("owner-1", "post-1", input);
    expect(first.status).toBe(expected);
    expect(first.postUrl).toBeNull();
    expect(updateUpload).toHaveBeenCalledTimes(1);
    expect(updateMedia).toHaveBeenCalledTimes(1);
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(createJob.mock.calls[0]?.[0].data.kind).toBe(job);
    if (expected === "expired") {
      expect(createJob.mock.calls[0]?.[0].data.availableAt)
        .toEqual(new Date(row.reservationExpiresAt.getTime() + 60_000));
    } else {
      expect(createJob.mock.calls[0]?.[0].data.mediaId).toBe("media-1");
      expect(updateUpload.mock.calls[0]?.[0].data.status).toBe("uploaded");
      expect(storage.head).toHaveBeenCalledWith(row.sourceKey);
    }
    const duplicate = await feed.reserveUpload("owner-1", "post-1", input);
    expect(duplicate.status).toBe(expected);
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(storage.presignPost).not.toHaveBeenCalled();
  });
});
