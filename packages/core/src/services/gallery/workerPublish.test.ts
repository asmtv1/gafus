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

describe("Gallery Cloud maintenance excludes retired photo publication", () => {
  it("refuses old exact publish upload without leasing any S3 job", async () => {
    const { worker, findMany } = setup();
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "upload-a" })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("selects only cleanup, move and vet preview kinds from unscoped queue", async () => {
    const { worker, findMany } = setup();
    await worker.claimStorageJobs({ limit: 1 });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).not.toHaveProperty("uploadId");
    expect(where.kind).toEqual({ in: ["delete", "move", "vetPreview"] });
  });

  it("does not allow publishing while the gallery is disabled", async () => {
    const { worker, findMany } = setup(false);
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "upload-a" })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await worker.claimStorageJobs({ limit: 1 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: { in: ["delete", "vetPreview"] } }),
      }),
    );
  });

  it("limits background Gallery deletion to a single exact owner and job", async () => {
    const {worker,findMany}=setup();
    await expect(worker.claimStorageJobs({limit:1,exactDelete:{jobId:"own-job",ownerId:"own-user"}})).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({id:"own-job",ownerId:"own-user",kind:"delete"}),take:3,
    }));
  });
  it("claims a move only by exact source-proven job and owner, never historical queue",async()=>{
    const {worker,findMany}=setup();
    await expect(worker.claimStorageJobs({limit:1,exactMove:{jobId:"own-move",ownerId:"own-user"}})).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({id:"own-move",ownerId:"own-user",kind:"move"}),take:3,
    }));
  });
  it("rejects mixed or malformed scoped move before any SQL",async()=>{
    const {worker,findMany}=setup();
    await expect(worker.claimStorageJobs({limit:1,exactMove:{jobId:"../cross",ownerId:"owner"}})).rejects.toMatchObject({code:"VALIDATION"});
    await expect(worker.claimStorageJobs({limit:1,exactMove:{jobId:"job",ownerId:"owner"},exactDelete:{jobId:"job",ownerId:"owner"}})).rejects.toMatchObject({code:"VALIDATION"});
    await expect(worker.claimStorageJobs({limit:1,exactMove:{jobId:"job",ownerId:"owner"},uploadId:"upload"})).rejects.toMatchObject({code:"VALIDATION"});
    expect(findMany).not.toHaveBeenCalled();
  });
  it("never widens invalid or conflicting Gallery cleanup scope", async () => {
    const {worker,findMany}=setup();
    await expect(worker.claimStorageJobs({limit:1,exactDelete:{jobId:"../other",ownerId:"owner"}})).rejects.toMatchObject({code:"VALIDATION"});
    await expect(worker.claimStorageJobs({limit:1,exactDelete:{jobId:"job",ownerId:"owner"},uploadId:"other-upload"})).rejects.toMatchObject({code:"VALIDATION"});
    expect(findMany).not.toHaveBeenCalled();
  });
  it("rejects an invalid upload identifier before querying the database", async () => {
    const { worker, findMany } = setup();
    await expect(worker.claimStorageJobs({ limit: 1, uploadId: "../other" })).rejects.toMatchObject(
      { code: "VALIDATION" },
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
