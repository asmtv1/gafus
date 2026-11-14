import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  warn: vi.fn(),
  updateMany: vi.fn(),
  rows: [{ id: "notification-one" }] as { id: string }[],
  claimed: {
    id: "notification-one",
    userId: "user-one",
    title: "Бонус",
    body: "Начислен Гафус",
    url: "/gafus",
    attempts: 1,
    createdAt: new Date(),
  },
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: async () => mocks.rows,
        gafusNotificationOutbox: {
          update: async () => mocks.claimed,
        },
      }),
    gafusNotificationOutbox: {
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
  },
}));

vi.mock("@gafus/notifications-server", () => ({
  sendImmediatePushNotification: (...args: unknown[]) => mocks.push(...args),
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createWebLogger: () => ({ info: vi.fn(), warn: mocks.warn, error: vi.fn() }),
}));

import { processGafusNotifications } from "./gafus-notifications";

describe("Gafus notification outbox worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: "notification-one" }];
    mocks.claimed.createdAt = new Date();
    mocks.claimed.attempts = 1;
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.push.mockResolvedValue({ success: true });
  });

  it("marks a delivered push DONE and clears the lease", async () => {
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 1, failed: 0, skipped: 0,
    });
    expect(mocks.push).toHaveBeenCalledWith({
      userId: "user-one", title: "Бонус",
      body: "Начислен Гафус", url: "/gafus",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "DONE", attemptToken: null, leaseUntil: null,
      }),
      where: expect.objectContaining({
        id: "notification-one", status: "PROCESSING",
      }),
    }));
  });

  it("requeues failed delivery without repeating the reward", async () => {
    mocks.push.mockResolvedValue({ success: false, error: "push transport failed" });
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 0, failed: 1, skipped: 0,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING", attemptToken: null,
        errorCode: "GAFUS_PUSH_FAILED",
      }),
    }));
  });
  it("does not deliver stale bonuses after a delayed notification rollout", async () => {
    mocks.claimed.createdAt = new Date(Date.now() - 4 * 24 * 60 * 60_000);
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 0, failed: 0, skipped: 1,
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "DONE",
        errorCode: "GAFUS_NOTIFICATION_STALE",
      }),
    }));
  });

  it("does not mark ambiguous provider errors as sent or leak transport credentials to logs", async () => {
    const canary = "PRIVATE_PUSH_AUTHORIZATION_TOKEN";
    mocks.push.mockRejectedValueOnce(new Error(canary));
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 0, failed: 1, skipped: 0,
    });
    const logs = JSON.stringify(mocks.warn.mock.calls);
    expect(logs).not.toContain(canary);
    expect(logs).toContain("GAFUS_PUSH_FAILED");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "notification-one", status: "PROCESSING", attemptToken: expect.any(String),
      }),
      data: expect.objectContaining({ status: "PENDING", errorCode: "GAFUS_PUSH_FAILED" }),
    }));
  });

  it("moves fifth failed attempt to terminal FAILED with the same lease fencing", async () => {
    mocks.claimed.attempts = 5;
    mocks.push.mockResolvedValueOnce({ success: false, error: "synthetic timeout" });
    expect(await processGafusNotifications()).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", attemptToken: null }),
      where: expect.objectContaining({ status: "PROCESSING", attemptToken: expect.any(String) }),
    }));
  });

  it("treats no-subscription outcome as terminal without automatic replay", async () => {
    mocks.push.mockResolvedValueOnce({
      success: false, error: "У пользователя нет активных подписок",
    });
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 1, failed: 0, skipped: 0,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DONE", attemptToken: null }),
    }));
  });

  it("does not report success when lease-fenced SQL acknowledgement loses the race", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await processGafusNotifications()).toEqual({
      claimed: 1, sent: 0, failed: 0, skipped: 0,
    });
    expect(mocks.push).toHaveBeenCalledOnce();
  });

});