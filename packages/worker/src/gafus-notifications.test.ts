import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
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

vi.mock("@gafus/webpush", () => ({
  sendImmediatePushNotification: (...args: unknown[]) => mocks.push(...args),
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import { processGafusNotifications } from "./gafus-notifications";

describe("Gafus notification outbox worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: "notification-one" }];
    mocks.claimed.createdAt = new Date();
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

});