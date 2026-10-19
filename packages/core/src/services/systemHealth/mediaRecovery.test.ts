import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  galleryJobs: vi.fn(), galleryUploads: vi.fn(), galleryJobCount: vi.fn(),
  galleryUploadCount: vi.fn(), feedJobs: vi.fn(), feedJobCount: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    galleryStorageJob: { findMany: db.galleryJobs, count: db.galleryJobCount },
    galleryUpload: { findMany: db.galleryUploads, count: db.galleryUploadCount },
    feedStorageJob: { findMany: db.feedJobs, count: db.feedJobCount },
  },
}));
import { inspectCoreDueMediaWork } from "./mediaRecovery";

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of [db.galleryJobs, db.galleryUploads, db.feedJobs]) f.mockResolvedValue([]);
  for (const f of [db.galleryJobCount, db.galleryUploadCount, db.feedJobCount])
    f.mockResolvedValue(0);
});

describe("read-only Core due inspections match lease policies", () => {
  it("inspects runnable Gallery uploads, cleanup jobs and in-flight leases", async () => {
    db.galleryJobs.mockResolvedValue([{id:"a"}]);
    db.galleryUploads.mockResolvedValue([{id:"b"}]);
    db.galleryJobCount.mockResolvedValue(1);
    db.galleryUploadCount.mockResolvedValue(2);
    expect(await inspectCoreDueMediaWork("gallery")).toEqual({
      dueIds:["job:a","upload:b"],active:3,
    });
    expect(db.galleryJobs.mock.calls[0]![0].where.createdAt.lte)
      .toBeInstanceOf(Date);
    expect(db.galleryUploads.mock.calls[0]![0].where.updatedAt.lte)
      .toBeInstanceOf(Date);
    expect(db.galleryJobs.mock.calls[0]![0].where.OR).toContainEqual({
      status:"pending",availableAt:{lte:expect.any(Date)},
    });
    expect(db.galleryUploads.mock.calls[0]![0].where.OR).toContainEqual({
      status:"uploaded",nextAttemptAt:{lte:expect.any(Date)},
    });
    expect(db.galleryJobCount.mock.calls[0]![0].where).toEqual({
      status:"processing",leaseUntil:{gt:expect.any(Date)},
    });
  });

  it("separates due Feed video from photo and avoids currently leased jobs", async () => {
    db.feedJobs.mockResolvedValueOnce([{id:"v"}]).mockResolvedValueOnce([]);
    db.feedJobCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await inspectCoreDueMediaWork("feed-video")).toEqual({
      dueIds:["v"],active:1,
    });
    expect(db.feedJobs.mock.calls[0]![0].where.kind).toBe("publish_video");
    expect(db.feedJobs.mock.calls[0]![0].where.createdAt.lte)
      .toBeInstanceOf(Date);
    expect(db.feedJobs.mock.calls[0]![0].where.OR).toContainEqual({
      status:"processing",leaseUntil:{lt:expect.any(Date)},
    });
    expect(await inspectCoreDueMediaWork("feed-photo")).toEqual({ dueIds: [], active: 0 });
    expect(db.feedJobs.mock.calls[1]![0].where.kind.in).toEqual([
      "copy_album","publish_photo","delete_keys","cleanup_source",
    ]);
  });


  it("returns no due work for empty queues", async () => {
    for (const kind of ["gallery", "feed-photo", "feed-video"] as const)
      expect(await inspectCoreDueMediaWork(kind)).toEqual({ dueIds: [], active: 0 });
  });
  it("propagates read failures instead of treating them as empty queues", async () => {
    db.feedJobs.mockRejectedValueOnce(Error("DB_UNAVAILABLE"));
    await expect(inspectCoreDueMediaWork("feed-video")).rejects.toThrow("DB_UNAVAILABLE");
  });
});
