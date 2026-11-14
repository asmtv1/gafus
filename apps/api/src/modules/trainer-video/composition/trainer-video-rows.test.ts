import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  createTrainerVideoRow: vi.fn(),
  markTrainerVideoTranscodingFailedRow: vi.fn(),
  readTrainerVideoDeleteRow: vi.fn(),
  clearTrainerStepVideoReferences: vi.fn(),
  clearTrainerTemplateVideoReferences: vi.fn(),
  deleteTrainerVideoRow: vi.fn(),
  readTrainerVideoOwnerRow: vi.fn(),
  renameTrainerVideoForOwner: vi.fn(),
  readTrainerVideosRows: vi.fn(),
  readTrainerVideoStatusRows: vi.fn(),
  readTrainerVideoMetadataRow: vi.fn(),
  readTrainerVideoManifestRow: vi.fn(),
  readTrainerVideoPlaybackRow: vi.fn(),
}));
vi.mock("@gafus/media-server/trainer-video-rows", () => db);
import {
  getTrainerVideos,
  updateTrainerVideoName,
  getMultipleVideoStatuses,
} from "./trainer-video-rows.js";
const date = new Date("2026-10-15T10:00:00.000Z");
beforeEach(() => {
  vi.clearAllMocks();
  db.readTrainerVideosRows.mockResolvedValue([
    {
      id: "video-A",
      trainerId: "owner-A",
      relativePath: "private/path",
      originalName: "training.mp4",
      displayName: null,
      mimeType: "video/mp4",
      fileSize: 3_000_000_000n,
      durationSec: 90,
      hlsManifestPath: null,
      thumbnailPath: null,
      transcodingStatus: "COMPLETED",
      transcodingError: null,
      createdAt: date,
      updatedAt: date,
      trainer: { username: "trainer", profile: { fullName: "Trainer" } },
    },
  ]);
});
describe("API trainer-video composition preserves Core policy with owner-bound SQL", () => {
  it("passes exact actor/filter to SQL port and converts bigint without exposing credentials", async () => {
    const videos = await getTrainerVideos("owner-A", { forAdmin: false });
    expect(db.readTrainerVideosRows).toHaveBeenCalledExactlyOnceWith("owner-A", false);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ fileSize: 3_000_000_000, trainerId: "owner-A" });
    expect(videos[0]?.trainer).toEqual({ username: "trainer", fullName: "Trainer" });
  });
  it("never renames a foreign owner's video after the initial projection", async () => {
    db.readTrainerVideoOwnerRow.mockResolvedValueOnce({ id: "video-A", trainerId: "owner-B" });
    const result = await updateTrainerVideoName("video-A", "owner-A", "new");
    expect(result).toMatchObject({ success: false });
    expect(db.renameTrainerVideoForOwner).not.toHaveBeenCalled();
  });
  it("retains atomic where-id-and-owner CAS and rejects stale/missing rename", async () => {
    db.readTrainerVideoOwnerRow.mockResolvedValue({ id: "video-A", trainerId: "owner-A" });
    db.renameTrainerVideoForOwner.mockResolvedValue(false);
    await expect(updateTrainerVideoName("video-A", "owner-A", "new")).resolves.toMatchObject({
      success: false,
    });
    expect(db.renameTrainerVideoForOwner).toHaveBeenCalledExactlyOnceWith(
      "video-A",
      "owner-A",
      "new",
    );
    db.renameTrainerVideoForOwner.mockResolvedValue(true);
    await expect(updateTrainerVideoName("video-A", "owner-A", null)).resolves.toMatchObject({
      success: true,
    });
  });
  it("forwards only requested status IDs and projects bounded metadata", async () => {
    db.readTrainerVideoStatusRows.mockResolvedValue([
      {
        id: "video-A",
        transcodingStatus: "COMPLETED",
        transcodingError: null,
        hlsManifestPath: null,
        thumbnailPath: null,
        durationSec: 90,
      },
    ]);
    const result = await getMultipleVideoStatuses(["video-A"]);
    expect(result).toMatchObject({ success: true, data: [{ id: "video-A", durationSec: 90 }] });
    expect(db.readTrainerVideoStatusRows).toHaveBeenCalledExactlyOnceWith(["video-A"]);
  });
});
