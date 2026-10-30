import { describe, expect, it, vi } from "vitest";
import type { FeedTx } from "./ports";
import { enqueueFeedAccountCleanup, enqueueFeedPostCleanup, feedPossibleOutputKeys } from "./cleanup";

describe("feed post S3 cleanup", () => {
  it("queues all post media, original uploads and potential unrecorded video outputs", async () => {
    const prefix = "posts/owner-1/post-1/";
    const video = "media/v2/video-1/v1/";
    const photo = "media/v2/photo-1/v1/";
    const source = prefix + "incoming/upload-1/source.mp4";
    const expiry = new Date("2026-10-13T12:04:00Z");
    const reservationExpiry = new Date("2026-10-13T12:09:00Z");
    const lease = new Date("2026-10-13T12:06:00Z");
    const upsert = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const tx = {
      feedMediaAsset: { findMany: vi.fn(async () => [
        { id: "video-1", kind: "video", posterKey: video + "poster.webp",
          smallKey: null, thumbKey: null, fullKey: null,
          mp4Keys: [video + "video/360.mp4", video + "video/720.mp4"] },
        { id: "photo-1", kind: "photo", posterKey: null,
          smallKey: photo + "image/s.webp", thumbKey: photo + "image/m.webp",
          fullKey: photo + "image/l.webp", mp4Keys: [] },
      ]) },
      feedUpload: { findMany: vi.fn(async () => [{ sourceKey: source, postExpiresAt: expiry, reservationExpiresAt: reservationExpiry }]) },
      feedStorageJob: {
        findMany: vi.fn(async () => [{
          sourceKeys: [source, "albums/owner-1/shared/photos/photo/full.webp"],
          targetKeys: [photo + "image/l.webp"],
          leaseUntil: lease,
        }]),
        updateMany, upsert,
      },
    } as unknown as FeedTx;
    const at = new Date("2026-10-13T12:00:00Z");
    await enqueueFeedPostCleanup(tx, "post-1", "owner-1", at, "delete");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        postId: "post-1", kind: { notIn: ["delete_keys", "cleanup_source"] },
        status: { in: ["pending", "processing"] },
      },
      data: { status: "failed", attemptToken: null, leaseUntil: null, errorCode: "POST_DELETED" },
    });
    const keys = upsert.mock.calls.flatMap(([arg]) => arg.create.sourceKeys as string[]);
    expect(keys).toContain(source);
    expect(keys).toContain(video + "poster.webp");
    expect(keys).toContain(video + "video/360.mp4");
    expect(keys).toContain(video + "video/720.mp4");
    expect(keys).toContain(video + "video/1080.mp4");
    expect(keys).toContain(photo + "image/s.webp");
    expect(keys).toContain(photo + "image/m.webp");
    expect(keys).toContain(photo + "image/l.webp");
    expect(keys).not.toContain(photo + "poster.webp");
    expect(keys).toHaveLength(new Set(keys).size);
    expect(keys.every(key => key.startsWith(prefix) || key.startsWith(video) ||
      key.startsWith(photo))).toBe(true);
    expect(keys).not.toContain("albums/owner-1/shared/photos/photo/full.webp");
    expect(upsert.mock.calls.every(([arg]) =>
      arg.create.kind === "delete_keys" && arg.create.ownerId === "owner-1" &&
      arg.create.postId === "post-1" && arg.create.sourceKeys.length <= 20 &&
      arg.create.availableAt.getTime() === reservationExpiry.getTime() + 60_000,
    )).toBe(true);
  });

  it("enumerates every immutable MP4 and WebP variant after an interrupted upload", () => {
    expect(feedPossibleOutputKeys("o", "p", "m", "video")).toEqual([
      "media/v2/m/v1/poster.webp", "media/v2/m/v1/video/360.mp4",
      "media/v2/m/v1/video/720.mp4", "media/v2/m/v1/video/1080.mp4",
    ]);
    expect(feedPossibleOutputKeys("o", "p", "m", "photo")).toEqual([
      "media/v2/m/v1/image/s.webp", "media/v2/m/v1/image/m.webp",
      "media/v2/m/v1/image/l.webp",
    ]);
  });

  it("uses immutable WebP/MP4 keys and upload reservation deadline in account deletion", async () => {
    const raw = vi.fn().mockResolvedValue(0);
    await enqueueFeedAccountCleanup({ $executeRaw: raw } as unknown as Pick<FeedTx, "$executeRaw">,
      "owned-user", new Date("2026-10-26T10:00:00Z"));
    expect(raw).toHaveBeenCalledTimes(4);
    const [segments] = raw.mock.calls[2] as [TemplateStringsArray, ...unknown[]];
    const sql = segments.join("?");
    expect(sql).toContain('max(GREATEST(u."postExpiresAt", u."reservationExpiresAt"))');
    expect(sql).toContain('m."mp4Keys"');
    expect(sql).toContain("video/1080.mp4");
    expect(sql).toContain("image/s.webp");
    expect(sql).not.toContain("hls/");
    expect(sql).toContain("ON CONFLICT");
  });

});
