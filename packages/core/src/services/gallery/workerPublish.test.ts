import { describe, expect, it, vi } from "vitest";
import { createGalleryWorkerOperations } from "./worker";
import type { GalleryContext } from "./context";

function setup(enabled = true) {
  const findMany = vi.fn(async () => []);
  const ctx = {
    now: () => new Date("2026-10-09T10:00:00Z"),
    storage: { enabled },
    db: { galleryStorageJob: { findMany } },
  } as unknown as GalleryContext;
  return { worker: createGalleryWorkerOperations(ctx), findMany };
}

describe("scoped immediate publish claim", () => {
  it("selects only a registered publish job for the requested upload", async () => {
    const { worker, findMany } = setup();
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "upload-a" })).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: "publish", uploadId: "upload-a" }),
      take: 3,
    }));
  });

  it("leaves the unscoped maintenance queue unchanged", async () => {
    const { worker, findMany } = setup();
    await worker.claimStorageJobs({ limit: 1 });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).not.toHaveProperty("uploadId");
    expect(where).not.toHaveProperty("kind");
  });

  it("does not allow publishing while the gallery is disabled", async () => {
    const { worker, findMany } = setup(false);
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "upload-a" })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await worker.claimStorageJobs({ limit: 1 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: "delete" }),
    }));
  });

  it("rejects an invalid upload identifier before querying the database", async () => {
    const { worker, findMany } = setup();
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "../other" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
