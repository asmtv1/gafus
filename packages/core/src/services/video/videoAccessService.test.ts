import { describe, expect, it, vi } from "vitest";
import { createVideoAccessService, type VideoAccessReadPorts } from "./videoAccessService";

function fixture() {
  const ports: VideoAccessReadPorts = {
    manifest: vi.fn().mockResolvedValue({
      hlsManifestPath: "hls/video/playlist.m3u8",
      thumbnailPath: "poster.webp",
      transcodingStatus: "COMPLETED",
      trainerId: "trainer",
    }),
    owner: vi.fn().mockResolvedValue({ trainerId: "trainer" }),
    stepOccurrences: vi.fn().mockResolvedValue([{ id: "stepA", dayId: "dayA" }]),
    dayOccurrences: vi.fn().mockResolvedValue([{ id: "course-dayA", dayId: "dayA" }]),
    hasPublishedDailyCourseVideo: vi.fn().mockResolvedValue(false),
    allowedCourseStep: vi.fn().mockResolvedValue(false),
  };
  return { ports, service: createVideoAccessService(ports) };
}

describe("course video authorization with an injected read port", () => {
  it("keeps legacy manifest wire DTO without a Core DB import", async () => {
    const { ports, service } = fixture();
    const dto = await service.getVideoManifestInfo("video-1");
    expect(dto).toMatchObject({ trainerId: "trainer", transcodingStatus: "COMPLETED" });
    expect(ports.manifest).toHaveBeenCalledWith("video-1");
    expect(ports.owner).not.toHaveBeenCalled();
  });
  it("denies missing videos without checking any other entitlements", async () => {
    const { ports, service } = fixture();
    vi.mocked(ports.owner).mockResolvedValueOnce(null);
    expect(await service.checkVideoAccess({ userId: "stranger", videoId: "missing" })).toBe(false);
    expect(ports.allowedCourseStep).not.toHaveBeenCalled();
    expect(ports.hasPublishedDailyCourseVideo).not.toHaveBeenCalled();
  });
  it("allows the video owner without unrelated SQL reads", async () => {
    const { ports, service } = fixture();
    expect(await service.checkVideoAccess({ userId: "trainer", videoId: "video-1" })).toBe(true);
    expect(ports.stepOccurrences).not.toHaveBeenCalled();
    expect(ports.allowedCourseStep).not.toHaveBeenCalled();
  });
  it("permits a paid step only for its exact course/day occurrence", async () => {
    const { ports, service } = fixture();
    vi.mocked(ports.allowedCourseStep).mockResolvedValueOnce(true);
    expect(await service.checkVideoAccess({ userId: "learner", videoId: "video-1" })).toBe(true);
    expect(ports.allowedCourseStep).toHaveBeenCalledWith(
      "learner",
      "course-dayA",
      "stepA",
      expect.any(Date),
    );
  });
  it("does not grant video access from another course's reused TrainingDay", async () => {
    const { ports, service } = fixture();
    vi.mocked(ports.dayOccurrences).mockResolvedValueOnce([{ id: "other-course", dayId: "dayB" }]);
    expect(await service.checkVideoAccess({ userId: "learner", videoId: "video-1" })).toBe(false);
    expect(ports.allowedCourseStep).not.toHaveBeenCalled();
  });
  it("accepts published daily course video only through the server read adapter", async () => {
    const { ports, service } = fixture();
    vi.mocked(ports.hasPublishedDailyCourseVideo).mockResolvedValueOnce(true);
    expect(await service.checkVideoAccess({ userId: "learner", videoId: "video-1" })).toBe(true);
    expect(ports.hasPublishedDailyCourseVideo).toHaveBeenCalledWith("video-1", expect.any(Date));
  });
  it("fails closed on errors from the ownership or entitlement adapters", async () => {
    const { ports, service } = fixture();
    vi.mocked(ports.owner).mockRejectedValueOnce(new Error("private-db-error"));
    expect(await service.checkVideoAccess({ userId: "learner", videoId: "video-1" })).toBe(false);
    vi.mocked(ports.allowedCourseStep).mockRejectedValueOnce(new Error("private-rights-error"));
    expect(await service.checkVideoAccess({ userId: "learner", videoId: "video-1" })).toBe(false);
  });
});
