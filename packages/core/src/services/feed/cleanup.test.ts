import { describe, expect, it, vi } from "vitest";
import type { FeedTx } from "./ports";
import { enqueueFeedPostCleanup } from "./cleanup";

describe("feed post S3 cleanup", () => {
  it("queues all post media, original uploads and potential unrecorded video outputs", async () => {
    const prefix = "posts/owner-1/post-1/";
    const video = prefix + "attachments/video-1/";
    const photo = prefix + "attachments/photo-1/";
    const source = prefix + "incoming/upload-1/source.mp4";
    const expiry = new Date("2026-10-13T12:04:00Z");
    const lease = new Date("2026-10-13T12:06:00Z");
    const upsert = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const tx = {
      feedMediaAsset: { findMany: vi.fn(async () => [
        { id: "video-1", posterKey: video + "poster.webp", playlistKey: video + "hls/playlist.m3u8",
          thumbKey: null, fullKey: null, videoSegmentKeys: [video + "hls/segment-000.ts"] },
        { id: "photo-1", posterKey: null, playlistKey: null,
          thumbKey: photo + "thumb.webp", fullKey: photo + "full.webp", videoSegmentKeys: [] },
      ]) },
      feedUpload: { findMany: vi.fn(async () => [{ sourceKey: source, postExpiresAt: expiry }]) },
      feedStorageJob: {
        findMany: vi.fn(async () => [{
          sourceKeys: [source, "albums/owner-1/shared/photos/photo/full.webp"],
          targetKeys: [photo + "full.webp"],
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
    expect(keys).toContain(video + "hls/playlist.m3u8");
    expect(keys).toContain(video + "hls/segment-000.ts");
    expect(keys).toContain(video + "hls/segment-059.ts");
    expect(keys).toContain(photo + "thumb.webp");
    expect(keys).toContain(photo + "full.webp");
    expect(keys).toHaveLength(new Set(keys).size);
    expect(keys.every(key => key.startsWith(prefix))).toBe(true);
    expect(keys).not.toContain("albums/owner-1/shared/photos/photo/full.webp");
    expect(upsert.mock.calls.every(([arg]) =>
      arg.create.kind === "delete_keys" && arg.create.ownerId === "owner-1" &&
      arg.create.postId === "post-1" && arg.create.sourceKeys.length <= 20 &&
      arg.create.availableAt.getTime() === lease.getTime() + 60_000,
    )).toBe(true);
  });
});
