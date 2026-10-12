import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const subscriptionsFindMany = vi.hoisted(() => vi.fn());
const subscriptionsDeleteMany = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({
  prisma: {
    reminder: { updateMany, findMany },
    pushSubscription: { findMany: subscriptionsFindMany, deleteMany: subscriptionsDeleteMany },
  },
}));

import {
  claimTrainingReminder, releaseFailedTrainingReminderClaim,
  listActiveTrainingReminderCandidates,
  getTrainingReminderPushSubscriptions,
  removeInvalidTrainingReminderEndpoints,
} from "./trainingReminderClaims";

describe("atomic training reminder delivery claim", () => {
  const previous = new Date("2026-10-10T06:30:00Z");
  const now = new Date("2026-10-11T06:30:00Z");
  beforeEach(() => vi.clearAllMocks());

  it("loads push subscriptions for one recipient only", async () => {
    subscriptionsFindMany.mockResolvedValue([]);
    expect(await getTrainingReminderPushSubscriptions("u1")).toEqual([]);
    expect(subscriptionsFindMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("does not issue writes for an empty invalid endpoint list", async () => {
    expect(await removeInvalidTrainingReminderEndpoints([])).toBe(0);
    expect(subscriptionsDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes only invalid web push endpoints", async () => {
    subscriptionsDeleteMany.mockResolvedValue({ count: 2 });
    expect(await removeInvalidTrainingReminderEndpoints(["invalid-1", "invalid-2"])).toBe(2);
    expect(subscriptionsDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ["invalid-1", "invalid-2"] } },
    });
  });

  it("claims only when the row was unchanged by another worker", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const input = { id: "rem-1", userId: "u1", lastSentAt: previous, now };
    expect(await claimTrainingReminder(input)).toBe(true);
    expect(await claimTrainingReminder(input)).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "rem-1", userId: "u1", type: "training",
        enabled: true, lastSentAt: previous },
      data: { lastSentAt: now },
    });
  });

  it("releases failed send only if the claim has not changed", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await releaseFailedTrainingReminderClaim({
      id: "rem-1", userId: "u1", previousLastSentAt: null, claimedAt: now,
    })).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "rem-1", userId: "u1", type: "training", lastSentAt: now },
      data: { lastSentAt: null },
    });
  });

  it("lists only active training reminders through core", async () => {
    findMany.mockResolvedValue([]);
    expect(await listActiveTrainingReminderCandidates()).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "training", enabled: true },
    }));
  });
});
