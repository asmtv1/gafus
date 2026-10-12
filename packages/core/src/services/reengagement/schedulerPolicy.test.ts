import { describe, expect, it, vi } from "vitest";
import { scheduleReengagementInCore } from "./schedulerPolicy";

function callbacks() {
  return {
    findInactiveUsers: vi.fn().mockResolvedValue([]),
    checkAndCloseReturnedCampaigns: vi.fn().mockResolvedValue(2),
    createCampaign: vi.fn().mockResolvedValue("campaign-1"),
    isDue: vi.fn().mockResolvedValue(true),
    activeCampaign: vi.fn().mockResolvedValue({ id: "active-1", currentLevel: 3 }),
    dispatch: vi.fn().mockResolvedValue(undefined),
    onCampaignError: vi.fn(),
  };
}

describe("reengagement scheduling business policy in core", () => {
  it("returns counts without sending anything when no inactive users exist", async () => {
    const deps = callbacks();
    expect(await scheduleReengagementInCore(deps)).toEqual({
      newCampaigns: 0, scheduledNotifications: 0, closedCampaigns: 2, inactiveUsersFound: 0,
    });
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("opens a new campaign once and dispatches its first notification", async () => {
    const deps = callbacks();
    const user = { userId: "user-1", hasActiveCampaign: false, lastActivityDate: new Date("2026-10-01") };
    deps.findInactiveUsers.mockResolvedValue([user]);
    expect(await scheduleReengagementInCore(deps)).toMatchObject({
      newCampaigns: 1, scheduledNotifications: 1,
    });
    expect(deps.createCampaign).toHaveBeenCalledWith("user-1", user.lastActivityDate);
    expect(deps.dispatch).toHaveBeenCalledWith("campaign-1", "user-1", 1);
  });

  it("does not repeat notifications until existing campaign becomes due", async () => {
    const deps = callbacks();
    deps.findInactiveUsers.mockResolvedValue([{ userId: "user-2", hasActiveCampaign: true }]);
    deps.isDue.mockResolvedValue(false);
    expect(await scheduleReengagementInCore(deps)).toMatchObject({
      newCampaigns: 0, scheduledNotifications: 0,
    });
    expect(deps.dispatch).not.toHaveBeenCalled();
    deps.isDue.mockResolvedValue(true);
    expect(await scheduleReengagementInCore(deps)).toMatchObject({ scheduledNotifications: 1 });
    expect(deps.dispatch).toHaveBeenCalledWith("active-1", "user-2", 3);
  });

  it("does not block unrelated users after one campaign fails to create", async () => {
    const deps = callbacks();
    deps.findInactiveUsers.mockResolvedValue([
      { userId: "bad", lastActivityDate: new Date("2026-10-01"), hasActiveCampaign: false },
      { userId: "good", lastActivityDate: new Date("2026-10-02"), hasActiveCampaign: false },
    ]);
    deps.createCampaign.mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce("campaign-good");
    const result = await scheduleReengagementInCore(deps);
    expect(result.newCampaigns).toBe(1);
    expect(result.scheduledNotifications).toBe(1);
    expect(deps.onCampaignError).toHaveBeenCalledTimes(1);
    expect(deps.dispatch).toHaveBeenCalledWith("campaign-good", "good", 1);
  });
});
