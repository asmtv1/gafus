import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockLogger, createMockPrisma } from "./test/test-utils";

const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();

vi.mock("@gafus/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => mockLogger,
}));

describe("analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findInactiveUsers", () => {
    it("возвращает пустой массив когда нет пользователей с активностью", async () => {
      const { findInactiveUsers } = await import("./analyzer");
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await findInactiveUsers();

      expect(result).toEqual([]);
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
    });

    it("возвращает неактивных пользователей при соответствии критериям", async () => {
      const { findInactiveUsers } = await import("./analyzer");
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          userTrainings: [
            {
              steps: [{ updatedAt: pastDate }],
            },
          ],
          reengagementCampaigns: [],
        },
      ]);
      mockPrisma.userStep.count.mockResolvedValue(5);

      const result = await findInactiveUsers();

      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("userId");
        expect(result[0]).toHaveProperty("lastActivityDate");
        expect(result[0]).toHaveProperty("daysSinceActivity");
        expect(result[0]).toHaveProperty("totalCompletions");
        expect(result[0]).toHaveProperty("hasActiveCampaign");
      }
    });

    it("пробрасывает ошибку при сбое prisma", async () => {
      const { findInactiveUsers } = await import("./analyzer");
      mockPrisma.user.findMany.mockRejectedValue(new Error("DB error"));

      await expect(findInactiveUsers()).rejects.toThrow("DB error");
    });
  });

  describe("checkUserReturned", () => {
    it("возвращает true когда есть активность после начала кампании", async () => {
      const { checkUserReturned } = await import("./analyzer");
      const campaignStart = new Date();
      campaignStart.setDate(campaignStart.getDate() - 5);
      mockPrisma.userStep.findFirst.mockResolvedValue({ id: "step-1" });

      const result = await checkUserReturned("user-1", campaignStart);

      expect(result).toBe(true);
      expect(mockPrisma.userStep.findFirst).toHaveBeenCalled();
    });

    it("возвращает false когда нет активности", async () => {
      const { checkUserReturned } = await import("./analyzer");
      mockPrisma.userStep.findFirst.mockResolvedValue(null);

      const result = await checkUserReturned("user-1", new Date());

      expect(result).toBe(false);
    });
  });

  describe("getLastActivityDate", () => {
    it("возвращает дату последней активности", async () => {
      const { getLastActivityDate } = await import("./analyzer");
      const lastDate = new Date();
      mockPrisma.userStep.findFirst.mockResolvedValue({ updatedAt: lastDate });

      const result = await getLastActivityDate("user-1");

      expect(result).toEqual(lastDate);
    });

    it("возвращает null когда нет завершённых шагов", async () => {
      const { getLastActivityDate } = await import("./analyzer");
      mockPrisma.userStep.findFirst.mockResolvedValue(null);

      const result = await getLastActivityDate("user-1");

      expect(result).toBeNull();
    });
  });
});
