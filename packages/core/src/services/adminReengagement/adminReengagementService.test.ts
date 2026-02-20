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
});
