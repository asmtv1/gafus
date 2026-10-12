import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockLogger, createMockPrisma } from "./test/test-utils";

const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();

vi.mock("@gafus/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => mockLogger,
}));

describe("metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.reengagementCampaign.count.mockResolvedValue(0);
    mockPrisma.reengagementNotification.count.mockResolvedValue(0);
    mockPrisma.reengagementMetrics.create.mockResolvedValue({} as never);
  });

  describe("recordDailyMetrics", () => {
    it("вызывает create для сохранения метрик", async () => {
      const { recordDailyMetrics } = await import("./metrics");

      await recordDailyMetrics();

      expect(mockPrisma.reengagementCampaign.count).toHaveBeenCalled();
      expect(mockPrisma.reengagementNotification.count).toHaveBeenCalled();
      expect(mockPrisma.reengagementMetrics.create).toHaveBeenCalled();
    });

    it("не выбрасывает при ошибке (логирует)", async () => {
      const { recordDailyMetrics } = await import("./metrics");
      mockPrisma.reengagementMetrics.create.mockRejectedValue(new Error("DB error"));

      await expect(recordDailyMetrics()).resolves.toBeUndefined();
    });
  });
});
