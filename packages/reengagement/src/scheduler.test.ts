import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analyzer", () => ({
  findInactiveUsers: vi.fn(),
}));

vi.mock("./campaign-manager", () => ({
  createCampaign: vi.fn(),
  checkAndCloseReturnedCampaigns: vi.fn(),
}));

vi.mock("@gafus/queues", () => ({
  reengagementQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    reengagementCampaign: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("scheduler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { checkAndCloseReturnedCampaigns } = await import("./campaign-manager");
    vi.mocked(checkAndCloseReturnedCampaigns).mockResolvedValue(0);
  });

  describe("scheduleReengagementCampaigns", () => {
    it("возвращает newCampaigns, scheduledNotifications, closedCampaigns", async () => {
      const { scheduleReengagementCampaigns } = await import("./scheduler");
      const { findInactiveUsers } = await import("./analyzer");
      const { createCampaign } = await import("./campaign-manager");
      const { prisma } = await import("@gafus/prisma");

      vi.mocked(findInactiveUsers).mockResolvedValue([]);

      const result = await scheduleReengagementCampaigns();

      expect(result).toEqual({
        newCampaigns: 0,
        scheduledNotifications: 0,
        closedCampaigns: 0,
      });
    });

    it("создаёт кампанию для неактивного пользователя без активной кампании", async () => {
      const { scheduleReengagementCampaigns } = await import("./scheduler");
      const { findInactiveUsers } = await import("./analyzer");
      const { createCampaign } = await import("./campaign-manager");
      const { reengagementQueue } = await import("@gafus/queues");

      const lastActivity = new Date();
      lastActivity.setDate(lastActivity.getDate() - 10);

      vi.mocked(findInactiveUsers).mockResolvedValue([
        {
          userId: "user-1",
          lastActivityDate: lastActivity,
          daysSinceActivity: 10,
          totalCompletions: 5,
          hasActiveCampaign: false,
        },
      ]);
      vi.mocked(createCampaign).mockResolvedValue("campaign-1");

      const result = await scheduleReengagementCampaigns();

      expect(result.newCampaigns).toBe(1);
      expect(result.scheduledNotifications).toBe(1);
      expect(createCampaign).toHaveBeenCalledWith("user-1", lastActivity);
      expect(reengagementQueue.add).toHaveBeenCalled();
    });
  });

  describe("manualTriggerScheduler", () => {
    it("возвращает success и result при успешном запуске", async () => {
      const { manualTriggerScheduler } = await import("./scheduler");
      const { findInactiveUsers } = await import("./analyzer");

      vi.mocked(findInactiveUsers).mockResolvedValue([]);

      const result = await manualTriggerScheduler();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result!.newCampaigns).toBe(0);
    });

    it("возвращает success: false при ошибке", async () => {
      const { manualTriggerScheduler } = await import("./scheduler");
      const { findInactiveUsers } = await import("./analyzer");

      vi.mocked(findInactiveUsers).mockRejectedValue(new Error("Test error"));

      const result = await manualTriggerScheduler();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Test error");
    });
  });
});
