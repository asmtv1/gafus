import { beforeEach, describe, expect, it, vi } from "vitest";
const update = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({ prisma: { trainerVideo: { update } } }));
import {
  startTrainerVideoTranscoding, completeTrainerVideoTranscoding, failTrainerVideoTranscoding,
} from "./transcodingLifecycle";
describe("trainer video transcoding transitions in core", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sets PROCESSING before media I/O", async () => {
    await startTrainerVideoTranscoding("v1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { transcodingStatus: "PROCESSING", transcodingError: null },
    });
  });
  it("stores verified HLS paths and integer duration", async () => {
    const completedAt = new Date("2026-10-11T00:00:00Z");
    await completeTrainerVideoTranscoding({
      videoId: "v1", hlsManifestPath: "hls/master.m3u8",
      thumbnailPath: null, durationSec: 12.7, hlsTotalSize: 1033, completedAt,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: expect.objectContaining({
        transcodingStatus: "COMPLETED", durationSec: 13,
        fileSize: 1033n, transcodedAt: completedAt,
      }),
    });
  });
  it("persists retryable failure state", async () => {
    await failTrainerVideoTranscoding("v1", "ffmpeg failed");
    expect(update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { transcodingStatus: "FAILED", transcodingError: "ffmpeg failed" },
    });
  });
});
