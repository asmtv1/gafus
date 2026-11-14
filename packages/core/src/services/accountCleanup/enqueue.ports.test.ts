import { describe, expect, it, vi } from "vitest";
import { createAccountStorageCleanup } from "./enqueue";

const tx = { isolatedTransaction: "same-unit-of-work" };
const now = new Date("2026-11-12T01:00:00Z");
const intent = { dualGallery: true, dualFeed: false,
  dualProviderMarker: "migration-dual-provider-required" };

describe("permanent account cleanup in caller-owned deletion transaction", () => {
  it("persists migration intent before enqueuing gallery and feed in the SAME transaction", async () => {
    const order: string[] = [];
    const insertSnapshot = vi.fn(async (...args: unknown[]) => { order.push("snapshot"); expect(args[0]).toBe(tx); });
    const enqueueGallery = vi.fn(async (...args: unknown[]) => { order.push("gallery"); expect(args[0]).toBe(tx); });
    const enqueueFeed = vi.fn(async (...args: unknown[]) => { order.push("feed"); expect(args[0]).toBe(tx); });
    const cleanup = createAccountStorageCleanup({
      readIntent: () => intent, insertSnapshot, enqueueGallery, enqueueFeed,
    });
    await cleanup(tx, "deleted-owner", now);
    expect(order).toEqual(["snapshot", "gallery", "feed"]);
    expect(insertSnapshot).toHaveBeenCalledExactlyOnceWith(tx, "deleted-owner", now, intent);
    expect(enqueueGallery).toHaveBeenCalledExactlyOnceWith(tx, "deleted-owner", now);
    expect(enqueueFeed).toHaveBeenCalledExactlyOnceWith(tx, "deleted-owner", now);
  });
  it("never enqueues a cleanup if snapshot insertion fails", async () => {
    const gallery = vi.fn();
    const feed = vi.fn();
    const cleanup = createAccountStorageCleanup({
      readIntent: () => intent,
      insertSnapshot: async () => { throw new Error("ROLLBACK_SIMULATED"); },
      enqueueGallery: gallery, enqueueFeed: feed,
    });
    await expect(cleanup(tx, "owner", now)).rejects.toThrow("ROLLBACK_SIMULATED");
    expect(gallery).not.toHaveBeenCalled();
    expect(feed).not.toHaveBeenCalled();
  });
});
