import { describe, it, expect, vi } from "vitest";
import { hasDueGalleryCloudWork } from "./recovery";
const now = new Date("2026-11-02T10:00:00Z");
function setup(uploads = 0, storage = 0) {
  const db = { galleryUpload: { count: vi.fn(async () => uploads) },
    galleryStorageJob: { count: vi.fn(async () => storage) } };
  return db;
}
describe("Gallery Core durable work eligibility", () => {
  it("does not wake an empty cloud pool", async () => {
    const db = setup();
    await expect(hasDueGalleryCloudWork(db as never, now)).resolves.toBe(false);
    expect(db.galleryUpload.count).toHaveBeenCalledOnce();
    expect(db.galleryStorageJob.count).toHaveBeenCalledOnce();
  });
  it("recovers reserved or uploaded photos, expired leases, and abandoned reservations", async () => {
    const db = setup(2);
    await expect(hasDueGalleryCloudWork(db as never, now)).resolves.toBe(true);
    expect(db.galleryStorageJob.count).not.toHaveBeenCalled();
    expect(db.galleryUpload.count).toHaveBeenCalledWith({ where: { OR: [
      { status: { in: ["reserved", "uploaded"] },
        nextAttemptAt: { lte: now }, reservationExpiresAt: { gt: now } },
      { status: "processing", leaseUntil: { lte: now } },
      { status: { in: ["reserved", "uploaded", "processing"] },
        reservationExpiresAt: { lte: now } },
    ] } });
  });
  it("wakes due pending/expired storage jobs and 1-hour failed delete recovery", async () => {
    const db = setup(0, 1);
    await expect(hasDueGalleryCloudWork(db as never, now)).resolves.toBe(true);
    expect(db.galleryStorageJob.count).toHaveBeenCalledWith({ where: { OR: [
      { status: "pending", availableAt: { lte: now } },
      { status: "processing", leaseUntil: { lte: now } },
      { kind: "delete", status: "failed",
        updatedAt: { lte: new Date("2026-11-02T09:00:00Z") } },
    ] } });
  });
  it("propagates DB errors without claiming a successful cloud launch", async () => {
    const db = setup();
    db.galleryUpload.count.mockRejectedValueOnce(new Error("DB_UNAVAILABLE"));
    await expect(hasDueGalleryCloudWork(db as never, now)).rejects.toThrow("DB_UNAVAILABLE");
  });
});
