import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  stepClear: vi.fn(),
  templateClear: vi.fn(),
  videoDelete: vi.fn(),
  invalidateSteps: vi.fn(),
}));

vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: prismaMocks.invalidateSteps,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/cdn-upload", () => ({
  extractVideoIdFromCdnUrl: vi.fn(),
}));

vi.mock("@gafus/video-access", () => ({
  VIDEO_PLAYBACK_TOKEN_TTL_MINUTES: 720,
  getVideoAccessService: vi.fn(),
}));

import {
  deleteTrainerVideoRecord as coreDeleteTrainerVideoRecord,
  getTrainerVideos as coreGetTrainerVideos,
  registerTrainerVideo as coreRegisterTrainerVideo,
  type TrainerVideoPersistencePort,
} from "./trainerVideoService";
import type { RegisterTrainerVideoInput } from "./schemas";

const repo: TrainerVideoPersistencePort = {
  createTrainerVideoRow: prismaMocks.create,
  markTrainerVideoTranscodingFailedRow: vi.fn(),
  readTrainerVideoDeleteRow: vi.fn(),
  clearTrainerStepVideoReferences: prismaMocks.stepClear,
  clearTrainerTemplateVideoReferences: prismaMocks.templateClear,
  deleteTrainerVideoRow: prismaMocks.videoDelete,
  readTrainerVideoOwnerRow: vi.fn(),
  renameTrainerVideoForOwner: vi.fn(),
  readTrainerVideosRows: prismaMocks.findMany,
  readTrainerVideoStatusRows: vi.fn(),
  readTrainerVideoMetadataRow: vi.fn(),
  readTrainerVideoManifestRow: vi.fn(),
  readTrainerVideoPlaybackRow: vi.fn(),
};
const registerTrainerVideo = (input: RegisterTrainerVideoInput) =>
  coreRegisterTrainerVideo(repo, input);
const getTrainerVideos = (actor: string, options: { forAdmin?: boolean } = {}) =>
  coreGetTrainerVideos(repo, actor, options);
const deleteTrainerVideoRecord = (id: string, fullCdnUrl: string | null) =>
  coreDeleteTrainerVideoRecord(repo, id, fullCdnUrl);

const TWO_POINT_ONE_GIB = Math.ceil(2.1 * 1024 * 1024 * 1024);
const now = new Date("2026-07-13T00:00:00.000Z");

function trainerVideoRow(fileSize: bigint) {
  return {
    id: "video-1",
    trainerId: "trainer-1",
    relativePath: "uploads/trainers/trainer-1/video.mp4",
    originalName: "video.mp4",
    displayName: null,
    mimeType: "video/mp4",
    fileSize,
    durationSec: null,
    hlsManifestPath: null,
    thumbnailPath: null,
    transcodingStatus: "PENDING" as const,
    transcodingError: null,
    createdAt: now,
    updatedAt: now,
    trainer: {
      username: "trainer",
      profile: { fullName: "Trainer" },
    },
  };
}

describe("trainer video file size", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a 2.1 GiB upload as bigint and returns a JSON-safe number", async () => {
    prismaMocks.create.mockResolvedValue(trainerVideoRow(BigInt(TWO_POINT_ONE_GIB)));

    const result = await registerTrainerVideo({
      trainerId: "trainer-1",
      relativePath: "uploads/trainers/trainer-1/video.mp4",
      originalName: "video.mp4",
      mimeType: "video/mp4",
      fileSize: TWO_POINT_ONE_GIB,
    });

    expect(TWO_POINT_ONE_GIB).toBeGreaterThan(2_147_483_647);
    expect(prismaMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSize: TWO_POINT_ONE_GIB,
      }),
    );
    expect(result).toMatchObject({ success: true, data: { fileSize: TWO_POINT_ONE_GIB } });
  });

  it("maps bigint sizes from the database for the trainer list", async () => {
    prismaMocks.findMany.mockResolvedValue([trainerVideoRow(BigInt(TWO_POINT_ONE_GIB))]);

    await expect(getTrainerVideos("trainer-1")).resolves.toEqual([
      expect.objectContaining({ fileSize: TWO_POINT_ONE_GIB }),
    ]);
  });
});

describe("video deletion invalidates affected cached lesson steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.stepClear.mockResolvedValue(["step-a", "step-b"]);

    prismaMocks.templateClear.mockResolvedValue(undefined);
    prismaMocks.videoDelete.mockResolvedValue({});
  });

  it("invalidates all reused steps as soon as their video URLs are changed", async () => {
    const result = await deleteTrainerVideoRecord("video-1", "https://cdn/video-1");

    expect(result.success).toBe(true);
    expect(prismaMocks.stepClear).toHaveBeenCalledWith("video-1", "https://cdn/video-1");
    expect(prismaMocks.invalidateSteps).toHaveBeenCalledExactlyOnceWith(["step-a", "step-b"]);
  });

  it("does not invalidate when the DB step update fails", async () => {
    prismaMocks.stepClear.mockRejectedValueOnce(new Error("db down"));

    const result = await deleteTrainerVideoRecord("video-1", "https://cdn/video-1");

    expect(result.success).toBe(false);
    expect(prismaMocks.invalidateSteps).not.toHaveBeenCalled();
  });

  it("invalidates after step mutation even when later video deletion fails", async () => {
    prismaMocks.videoDelete.mockRejectedValueOnce(new Error("delete failed"));

    const result = await deleteTrainerVideoRecord("video-1", "https://cdn/video-1");

    expect(result.success).toBe(false);
    expect(prismaMocks.invalidateSteps).toHaveBeenCalledExactlyOnceWith(["step-a", "step-b"]);
  });
});
