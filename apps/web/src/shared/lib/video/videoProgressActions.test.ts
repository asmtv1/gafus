import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }) }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("@gafus/core/services/video", () => ({
  getProgress: vi.fn(),
  saveProgress: vi.fn()
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: false, error: "rejected" }),
}));

import { syncVideoProgressFromLocal } from "./videoProgressActions";

describe("syncVideoProgressFromLocal", () => {
  it("acknowledges only video records confirmed by the server", async () => {
    const result = await syncVideoProgressFromLocal([
      { videoId: "video-1", lastPositionSec: 12 },
      { videoId: "video-2", lastPositionSec: 24 },
    ]);

    expect(result).toEqual({
      success: false,
      syncedCount: 1,
      confirmedVideoIds: ["video-1"],
      error: "Не все прогрессы подтверждены сервером",
    });
  });
});
