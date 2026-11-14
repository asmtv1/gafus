import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  progress: vi.fn(), video: vi.fn(), upsert: vi.fn(),
  info: vi.fn(), warn: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  userVideoProgress: { findUnique: m.progress, upsert: m.upsert },
  trainerVideo: { findUnique: m.video },
} }));
vi.mock("@gafus/logger", () => ({createWebLogger:()=>({info:m.info,warn:m.warn})}));
import { getProgress, saveProgress } from "./videoProgressService.js";

beforeEach(() => {
  vi.clearAllMocks();
  m.video.mockResolvedValue({ id: "video" });
  m.upsert.mockResolvedValue({});
});
describe("playback bookmarks persistence owns SQL", () => {
  it("restricts lookup to user + video compound key", async () => {
    m.progress.mockResolvedValue({ lastPositionSec: 53 });
    expect(await getProgress("owner", "video")).toEqual({ lastPositionSec: 53 });
    expect(m.progress).toHaveBeenCalledWith({
      where: { userId_videoId: {userId:"owner",videoId:"video"} },
      select: { lastPositionSec: true },
    });
  });
  it("does not access SQL for rejected positions", async () => {
    expect((await saveProgress("owner", "video", -1)).success).toBe(false);
    expect((await saveProgress("owner", "video", 86400 * 24 + 1)).success).toBe(false);
    expect(m.video).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("requires an existing video and always scopes the bookmark by owner", async () => {
    m.video.mockResolvedValueOnce(null);
    expect(await saveProgress("owner", "missing", 15)).toEqual({success:false,error:"Видео не найдено"});
    expect(m.upsert).not.toHaveBeenCalled();
    expect(await saveProgress("owner", "video", 15)).toEqual({success:true});
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{userId_videoId:{userId:"owner",videoId:"video"}},
      create:{userId:"owner",videoId:"video",lastPositionSec:15},
    }));
  });
  it("does not put actor IDs in high-frequency telemetry", async () => {
    m.progress.mockResolvedValue(null);
    await getProgress("private-owner", "private-video");
    await saveProgress("private-owner", "private-video", 8);
    for (const c of [...m.info.mock.calls,...m.warn.mock.calls]) {
      expect(JSON.stringify(c)).not.toContain("private-owner");
      expect(JSON.stringify(c)).not.toContain("private-video");
    }
  });
});
