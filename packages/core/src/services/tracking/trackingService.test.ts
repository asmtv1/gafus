import { describe, expect, it, beforeEach, vi } from "vitest";

import { trackReengagementClick } from "./trackingService";

const mockReengagementNotificationUpdate = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    reengagementNotification: {
      update: (...args: unknown[]) => mockReengagementNotificationUpdate(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("trackReengagementClick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when notificationId empty", async () => {
    const result = await trackReengagementClick("");

    expect(result).toEqual({
      success: false,
      error: "ID уведомления не указан",
    });
  });

  it("updates notification and returns success", async () => {
    mockReengagementNotificationUpdate.mockResolvedValue({});

    const result = await trackReengagementClick("notif-1");

    expect(result).toEqual({ success: true });
    expect(mockReengagementNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-1" },
        data: expect.objectContaining({ clicked: true }),
      }),
    );
  });

  it("returns error when update fails", async () => {
    mockReengagementNotificationUpdate.mockRejectedValue(new Error("Network error"));

    const result = await trackReengagementClick("notif-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });
});
