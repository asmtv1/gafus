/** Core deletion intent MUST be a single transaction: SQL snapshots then immutable outbox jobs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; tx: unknown; owner: string; at: Date; flags?: unknown }>,
  failure: false,
}));
vi.mock("@gafus/identity-write-server/account-cleanup-records", () => ({
  insertAccountMediaCleanupSnapshotsTx: async (tx: unknown, owner: string, at: Date, flags: unknown) => {
    m.calls.push({ method: "snapshot", tx, owner, at, flags });
    if (m.failure) throw new Error("ATOMIC_SNAPSHOT_INSERT_FAILED");
  },
}));
vi.mock("@gafus/core/services/gallery", () => ({
  enqueueGalleryAccountCleanup: async (tx: unknown, owner: string, at: Date) => {
    m.calls.push({ method: "gallery", tx, owner, at });
  },
}));
vi.mock("@gafus/core/services/feed", () => ({
  enqueueFeedAccountCleanup: async (tx: unknown, owner: string, at: Date) => {
    m.calls.push({ method: "feed", tx, owner, at });
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  DUAL_PROVIDER_CLEANUP_MARKER: "migration-dual-provider-required",
}));
import { enqueueAccountStorageCleanup } from "./enqueue";
const tx = Object.freeze({ id: "SAME_DELETION_TRANSACTION" });
const at = new Date("2026-11-12T00:00:00Z");

beforeEach(() => { m.calls.length = 0; m.failure = false; });
afterEach(() => { vi.unstubAllEnvs(); });
describe("account-deletion Persistence composition", () => {
  it("holds one tx and immutable dual-provider intent across all three awaited writes", async () => {
    vi.stubEnv("GALLERY_DUAL_PROVIDER_CLEANUP", "true");
    vi.stubEnv("FEED_DUAL_PROVIDER_CLEANUP", "false");
    await enqueueAccountStorageCleanup(tx as never, "owner-A", at);
    expect(m.calls.map(x => x.method)).toEqual(["snapshot", "gallery", "feed"]);
    expect(m.calls.every(x => x.tx === tx && x.owner === "owner-A" && x.at === at)).toBe(true);
    expect(m.calls[0]?.flags).toEqual({ dualGallery: true, dualFeed: false,
      dualProviderMarker: "migration-dual-provider-required" });
  });
  it("fails the enclosing deletion transaction and does not queue cleanup on snapshot failure", async () => {
    m.failure = true;
    await expect(enqueueAccountStorageCleanup(tx as never, "owner-A", at))
      .rejects.toThrow("ATOMIC_SNAPSHOT_INSERT_FAILED");
    expect(m.calls.map(x => x.method)).toEqual(["snapshot"]);
  });
  it("reads cutover intent for EACH deletion rather than caching first-request flags", async () => {
    vi.stubEnv("GALLERY_DUAL_PROVIDER_CLEANUP", "false");
    await enqueueAccountStorageCleanup(tx as never, "owner-A", at);
    vi.stubEnv("GALLERY_DUAL_PROVIDER_CLEANUP", "true");
    await enqueueAccountStorageCleanup(tx as never, "owner-B", at);
    expect(m.calls[0]?.flags).toMatchObject({ dualGallery: false });
    expect(m.calls[3]?.flags).toMatchObject({ dualGallery: true });
  });
});
