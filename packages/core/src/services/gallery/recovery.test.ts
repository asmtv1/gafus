import { describe, it, expect, vi } from "vitest";
import { hasDueGalleryCloudWork } from "./recovery";
const now = new Date("2026-11-02T10:00:00Z");
function setup(storage = 0) {
  const db = { galleryStorageJob: { count: vi.fn(async () => storage) } };
  return db;
}
describe("Gallery Core durable work eligibility", () => {
  it("does not wake an empty cloud pool", async () => {
    const db = setup();
    await expect(hasDueGalleryCloudWork(db as never, now)).resolves.toBe(false);
    expect(db.galleryStorageJob.count).toHaveBeenCalledOnce();
  });
  it("never invokes Cloud Jobs solely for reserved or uploaded photos",async()=>{
    const db=setup(0);
    await expect(hasDueGalleryCloudWork(db as never,now)).resolves.toBe(false);
    expect(db.galleryStorageJob.count).toHaveBeenCalledWith({where:expect.objectContaining({
      kind:{in:["delete","move","vetPreview"]},
    })});
  });
  it("wakes due pending/expired storage jobs and 1-hour failed delete recovery", async () => {
    const db = setup(1);
    await expect(hasDueGalleryCloudWork(db as never, now)).resolves.toBe(true);
    expect(db.galleryStorageJob.count).toHaveBeenCalledWith({ where: { kind:{in:["delete","move","vetPreview"]}, OR: [
      { status: "pending", availableAt: { lte: now } },
      { status: "processing", leaseUntil: { lte: now } },
      { kind: "delete", status: "failed",
        updatedAt: { lte: new Date("2026-11-02T09:00:00Z") } },
    ] } });
  });
  it("propagates DB errors without claiming a successful cloud launch", async () => {
    const db = setup();
    db.galleryStorageJob.count.mockRejectedValueOnce(new Error("DB_UNAVAILABLE"));
    await expect(hasDueGalleryCloudWork(db as never, now)).rejects.toThrow("DB_UNAVAILABLE");
  });
});
