import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTrainerStepVideoReferences,
  clearTrainerTemplateVideoReferences,
  createTrainerVideoRow,
  deleteTrainerVideoRow,
  markTrainerVideoTranscodingFailedRow,
  readTrainerVideoDeleteRow,
  readTrainerVideoManifestRow,
  readTrainerVideoMetadataRow,
  readTrainerVideoOwnerRow,
  readTrainerVideoPlaybackRow,
  readTrainerVideosRows,
  readTrainerVideoStatusRows,
  renameTrainerVideoForOwner,
} from "./trainerVideoRows";

const db = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  delete: vi.fn(),
  stepFindMany: vi.fn(),
  stepUpdateMany: vi.fn(),
  templateUpdateMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    trainerVideo: {
      create: db.create,
      update: db.update,
      findUnique: db.findUnique,
      updateMany: db.updateMany,
      findMany: db.findMany,
      delete: db.delete,
    },
    step: { findMany: db.stepFindMany, updateMany: db.stepUpdateMany },
    stepTemplate: { updateMany: db.templateUpdateMany },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.updateMany.mockResolvedValue({ count: 1 });
  db.stepFindMany.mockResolvedValue([{ id: "step-1" }, { id: "step-2" }]);
  db.stepUpdateMany.mockResolvedValue({ count: 2 });
});

describe("Trainer video SQL repository", () => {
  it("converts file bytes > 2 GiB to bigint and includes only trainer public label", async () => {
    const fileSize = Math.ceil(2.1 * 1024 * 1024 * 1024);
    await createTrainerVideoRow({
      id: "video-1",
      trainerId: "trainer-1",
      relativePath: "trainer/video-1.mp4",
      originalName: "video-1.mp4",
      mimeType: "video/mp4",
      fileSize,
    });
    expect(db.create).toHaveBeenCalledWith({
      data: {
        id: "video-1",
        trainerId: "trainer-1",
        relativePath: "trainer/video-1.mp4",
        originalName: "video-1.mp4",
        mimeType: "video/mp4",
        fileSize: BigInt(fileSize),
        durationSec: null,
      },
      include: {
        trainer: { select: { username: true, profile: { select: { fullName: true } } } },
      },
    });
  });

  it("rejects changing another trainer's name at the SQL predicate even after an earlier owner check", async () => {
    db.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await renameTrainerVideoForOwner("video-1", "attacker", "renamed")).toBe(false);
    expect(await renameTrainerVideoForOwner("video-1", "owner", null)).toBe(true);
    expect(db.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "video-1", trainerId: "attacker" },
      data: { displayName: "renamed" },
    });
  });

  it("returns affected step IDs only after successful update, and does not silently skip missing ones", async () => {
    expect(await clearTrainerStepVideoReferences("video-1", "https://cdn/video-1")).toEqual([
      "step-1",
      "step-2",
    ]);
    const where = {
      OR: [{ videoUrl: { contains: "video-1" } }, { videoUrl: "https://cdn/video-1" }],
    };
    expect(db.stepFindMany).toHaveBeenCalledWith({ where, select: { id: true } });
    expect(db.stepUpdateMany).toHaveBeenCalledWith({ where, data: { videoUrl: null } });
    await clearTrainerTemplateVideoReferences("video-1", "https://cdn/video-1");
    expect(db.templateUpdateMany).toHaveBeenCalledWith({
      where,
      data: { videoUrl: null },
    });
    db.stepUpdateMany.mockRejectedValueOnce(new Error("db failed"));
    await expect(clearTrainerStepVideoReferences("video-1", "https://cdn/video-1")).rejects.toThrow(
      "db failed",
    );
  });

  it("keeps DB mutation and read projections scoped and has bounded status queries", async () => {
    await markTrainerVideoTranscodingFailedRow("video-1", "job failed");
    await readTrainerVideoDeleteRow("video-1");
    await readTrainerVideoOwnerRow("video-1");
    await readTrainerVideoMetadataRow("video-1");
    await readTrainerVideoManifestRow("video-1");
    await readTrainerVideoPlaybackRow("video-1");
    await readTrainerVideoStatusRows(["video-1", "video-2"]);
    await readTrainerVideosRows("owner", false);
    await readTrainerVideosRows("owner", true);
    await deleteTrainerVideoRow("video-1");
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "video-1" },
      data: { transcodingStatus: "FAILED", transcodingError: "job failed" },
    });
    expect(db.findUnique).toHaveBeenCalledTimes(5);
    expect(db.findMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["video-1", "video-2"] } },
      select: {
        id: true,
        transcodingStatus: true,
        transcodingError: true,
        hlsManifestPath: true,
        thumbnailPath: true,
        durationSec: true,
      },
    });
    expect(db.findMany.mock.calls[1]?.[0].where).toEqual({ trainerId: "owner" });
    expect(db.findMany.mock.calls[2]?.[0].where).toBeUndefined();
    expect(db.delete).toHaveBeenCalledWith({ where: { id: "video-1" } });
  });
});
