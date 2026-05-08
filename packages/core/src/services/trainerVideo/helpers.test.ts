import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    trainerVideo: {
      findUnique: findUniqueMock,
    },
  },
}));

import { getAuthorizedVideoInfoForStreaming } from "./helpers";

describe("getAuthorizedVideoInfoForStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/playlist.m3u8",
      transcodingStatus: "COMPLETED",
      trainerId: "trainer-1",
    });
  });

  it("returns video streaming info for the owner trainer", async () => {
    const result = await getAuthorizedVideoInfoForStreaming("video-1", "trainer-1", "TRAINER");

    expect(result).toEqual({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/playlist.m3u8",
      transcodingStatus: "COMPLETED",
    });
  });

  it("returns video streaming info for admins", async () => {
    const result = await getAuthorizedVideoInfoForStreaming("video-1", "admin-1", "ADMIN");

    expect(result).toEqual({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/playlist.m3u8",
      transcodingStatus: "COMPLETED",
    });
  });

  it("does not return video streaming info for another trainer", async () => {
    const result = await getAuthorizedVideoInfoForStreaming("video-1", "trainer-2", "TRAINER");

    expect(result).toBeNull();
  });
});
