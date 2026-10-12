import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduler: vi.fn(),
  due: vi.fn(),
  active: vi.fn(),
  sendJob: vi.fn().mockResolvedValue({}),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@gafus/core/services/reengagement", () => ({
  scheduleReengagementInCore: mocks.scheduler,
  isReengagementNotificationDue: mocks.due,
  getActiveReengagementCampaignForScheduling: mocks.active,
  findInactiveUsers: vi.fn(),
  checkAndCloseReturnedCampaigns: vi.fn(),
  createCampaign: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({
  reengagementQueue: { add: mocks.sendJob },
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => mocks.log,
}));

import { manualTriggerScheduler, scheduleReengagementCampaigns } from "./scheduler";

describe("reengagement scheduler queue adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduler.mockResolvedValue({
      newCampaigns: 1, scheduledNotifications: 2,
      closedCampaigns: 3, inactiveUsersFound: 4,
    });
  });

  it("delegates scheduling to core and preserves the public response", async () => {
    await expect(scheduleReengagementCampaigns()).resolves.toEqual({
      newCampaigns: 1, scheduledNotifications: 2, closedCampaigns: 3,
    });
    expect(mocks.scheduler).toHaveBeenCalledTimes(1);
  });

  it("supplies BullMQ transport to the core business scheduler", async () => {
    mocks.scheduler.mockImplementationOnce(async deps => {
      await deps.dispatch("camp-1", "user-1", 1);
      return {
        newCampaigns: 1, scheduledNotifications: 1,
        closedCampaigns: 0, inactiveUsersFound: 1,
      };
    });
    await scheduleReengagementCampaigns();
    expect(mocks.sendJob).toHaveBeenCalledWith(
      "send-reengagement-notification",
      { campaignId: "camp-1", userId: "user-1", level: 1 },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it("exposes the manual trigger success status", async () => {
    expect(await manualTriggerScheduler()).toEqual({
      success: true,
      result: { newCampaigns: 1, scheduledNotifications: 2, closedCampaigns: 3 },
    });
  });

  it("reports a failed manual trigger", async () => {
    mocks.scheduler.mockRejectedValueOnce(new Error("scheduler failed"));
    expect(await manualTriggerScheduler()).toEqual({
      success: false, error: "scheduler failed",
    });
  });
});
