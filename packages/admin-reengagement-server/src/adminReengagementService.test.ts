import { describe, expect, it, beforeEach, vi } from "vitest";

import { getReengagementMetrics } from "./adminReengagementService";

const mockCampaignCount = vi.fn();
const mockNotificationCount = vi.fn();
const mockNotificationGroupBy = vi.fn();
const mockCampaignFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    reengagementCampaign: {
      count: (...args: unknown[]) => mockCampaignCount(...args),
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    reengagementNotification: {
      count: (...args: unknown[]) => mockNotificationCount(...args),
      groupBy: (...args: unknown[]) => mockNotificationGroupBy(...args),
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

describe("getReengagementMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaignCount.mockResolvedValue(0);
    mockNotificationCount.mockResolvedValue(0);
    mockNotificationGroupBy.mockResolvedValue([]);
    mockCampaignFindMany.mockResolvedValue([]);
  });

  it("returns metrics on success", async () => {
    const result = await getReengagementMetrics();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("returns error on prisma failure", async () => {
    mockCampaignCount.mockRejectedValue(new Error("DB error"));

    const result = await getReengagementMetrics();

    expect(result.success).toBe(false);
  });

  it("computes click and return rates without changing source data", async () => {
    // Campaigns and notifications use independent Prisma count mocks.
    mockCampaignCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    mockNotificationCount
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(7);
    mockNotificationGroupBy
      .mockResolvedValueOnce([{ level: 1, _count: { id: 4 } }])
      .mockResolvedValueOnce([{ level: 1, _count: { id: 1 } }])
      .mockResolvedValueOnce([{ messageType: "we-miss-you", _count: { id: 3 } }])
      .mockResolvedValueOnce([{ messageType: "we-miss-you", _count: { id: 2 } }]);

    const result = await getReengagementMetrics();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.overview).toMatchObject({
      totalCampaigns: 10,
      activeCampaigns: 4,
      totalNotificationsSent: 20,
      clickedNotifications: 7,
      returnRate: 30,
      clickRate: 35,
    });
    expect(result.data.byLevel.level1).toEqual({ sent: 4, clicked: 1, clickRate: 25 });
    expect(result.data.byLevel.level2).toEqual({ sent: 0, clicked: 0, clickRate: 0 });
    expect(result.data.byType.weMissYou).toEqual({ sent: 3, clicked: 2, clickRate: 66.67 });
  });

  it("preserves the service's generic fallback for non-Error database failures", async () => {
    mockCampaignCount.mockRejectedValue(null);

    await expect(getReengagementMetrics()).resolves.toEqual({
      success: false,
      error: "Неизвестная ошибка",
    });
  });
});
