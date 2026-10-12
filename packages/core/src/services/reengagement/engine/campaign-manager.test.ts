import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockLogger, createMockPrisma } from "./test/test-utils";

const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();

vi.mock("@gafus/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => mockLogger,
}));

describe("campaign-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCampaign", () => {
    it("создаёт кампанию и возвращает id", async () => {
      const { createCampaign } = await import("./campaign-manager");
      const lastActivity = new Date();
      mockPrisma.reengagementCampaign.create.mockResolvedValue({
        id: "campaign-1",
      } as never);

      const result = await createCampaign("user-1", lastActivity);

      expect(result).toBe("campaign-1");
      expect(mockPrisma.reengagementCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            lastActivityDate: lastActivity,
            isActive: true,
          }),
        }),
      );
    });

    it("пробрасывает ошибку при сбое", async () => {
      const { createCampaign } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.create.mockRejectedValue(new Error("DB error"));

      await expect(createCampaign("user-1", new Date())).rejects.toThrow("DB error");
    });
  });

  describe("updateCampaignAfterSend", () => {
    it("обновляет кампанию и уведомление", async () => {
      const { updateCampaignAfterSend } = await import("./campaign-manager");
      const lastActivity = new Date();
      mockPrisma.reengagementCampaign.findUnique.mockResolvedValue({
        currentLevel: 1,
        lastActivityDate: lastActivity,
        totalNotificationsSent: 0,
      } as never);
      mockPrisma.reengagementCampaign.update.mockResolvedValue({} as never);
      mockPrisma.reengagementNotification.update.mockResolvedValue({} as never);

      await updateCampaignAfterSend("campaign-1", "notif-1", 1, 0);

      expect(mockPrisma.reengagementCampaign.update).toHaveBeenCalled();
      expect(mockPrisma.reengagementNotification.update).toHaveBeenCalled();
    });

    it("не обновляет если кампания не найдена", async () => {
      const { updateCampaignAfterSend } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.findUnique.mockResolvedValue(null);

      await updateCampaignAfterSend("nonexistent", "notif-1", 1, 0);

      expect(mockPrisma.reengagementCampaign.update).not.toHaveBeenCalled();
    });
  });

  describe("closeCampaign", () => {
    it("обновляет кампанию с returned=true", async () => {
      const { closeCampaign } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.update.mockResolvedValue({} as never);

      await closeCampaign("campaign-1", true);

      expect(mockPrisma.reengagementCampaign.update).toHaveBeenCalledWith({
        where: { id: "campaign-1" },
        data: expect.objectContaining({
          isActive: false,
          returned: true,
        }),
      });
    });
  });

  describe("getCampaignData", () => {
    it("возвращает null если кампания не найдена", async () => {
      const { getCampaignData } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.findUnique.mockResolvedValue(null);

      const result = await getCampaignData("nonexistent");

      expect(result).toBeNull();
    });

    it("возвращает CampaignData при найденной кампании", async () => {
      const { getCampaignData } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.findUnique.mockResolvedValue({
        id: "c1",
        userId: "u1",
        currentLevel: 1,
        lastActivityDate: new Date(),
        notifications: [{ variantId: "v1" }],
      } as never);

      const result = await getCampaignData("c1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("c1");
      expect(result!.userId).toBe("u1");
      expect(result!.sentVariantIds).toEqual(["v1"]);
    });
  });

  describe("checkAndCloseReturnedCampaigns", () => {
    it("возвращает 0 когда нет активных кампаний", async () => {
      const { checkAndCloseReturnedCampaigns } = await import("./campaign-manager");
      mockPrisma.reengagementCampaign.findMany.mockResolvedValue([]);

      const result = await checkAndCloseReturnedCampaigns();

      expect(result).toBe(0);
    });

    it("закрывает кампании при наличии активности", async () => {
      const { checkAndCloseReturnedCampaigns } = await import("./campaign-manager");
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 10);
      mockPrisma.reengagementCampaign.findMany.mockResolvedValue([
        { id: "c1", userId: "u1", campaignStartDate: startDate },
      ] as never);
      mockPrisma.userStep.findFirst.mockResolvedValue({ id: "step" } as never);
      mockPrisma.reengagementCampaign.update.mockResolvedValue({} as never);

      const result = await checkAndCloseReturnedCampaigns();

      expect(result).toBe(1);
      expect(mockPrisma.reengagementCampaign.update).toHaveBeenCalled();
    });
  });
});
