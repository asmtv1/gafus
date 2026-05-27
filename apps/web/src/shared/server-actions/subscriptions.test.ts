import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteAllPushSubscriptionsMock,
  deletePushSubscriptionMock,
  getCurrentUserIdMock,
  getUserSubscriptionStatusMock,
  savePushSubscriptionMock,
} = vi.hoisted(() => ({
  deleteAllPushSubscriptionsMock: vi.fn(),
  deletePushSubscriptionMock: vi.fn(),
  getCurrentUserIdMock: vi.fn(),
  getUserSubscriptionStatusMock: vi.fn(),
  savePushSubscriptionMock: vi.fn(),
}));

vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: getCurrentUserIdMock,
}));

vi.mock("@gafus/core/services/subscriptions", () => ({
  deleteAllPushSubscriptions: deleteAllPushSubscriptionsMock,
  deletePushSubscriptionByEndpoint: deletePushSubscriptionMock,
  getUserSubscriptionCount: vi.fn(),
  getUserSubscriptionStatus: getUserSubscriptionStatusMock,
  getUserSubscriptions: vi.fn(),
  savePushSubscription: savePushSubscriptionMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import {
  deleteSubscriptionAction,
  getSubscriptionStatusAction,
  savePushSubscriptionAction,
  updateSubscriptionAction,
} from "./subscriptions";

describe("web subscription server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserIdMock.mockResolvedValue("user-1");
  });

  it("saves a push subscription for the current user", async () => {
    await expect(
      savePushSubscriptionAction({
        endpoint: "https://push.test/sub",
        keys: { auth: "auth", p256dh: "p256dh" },
      }),
    ).resolves.toEqual({ success: true });

    expect(savePushSubscriptionMock).toHaveBeenCalledWith({
      endpoint: "https://push.test/sub",
      keys: { auth: "auth", p256dh: "p256dh" },
      userId: "user-1",
    });
  });

  it("rejects invalid push subscription payloads before service calls", async () => {
    await expect(
      savePushSubscriptionAction({
        endpoint: "",
        keys: { auth: "", p256dh: "" },
      }),
    ).rejects.toThrow();

    expect(savePushSubscriptionMock).not.toHaveBeenCalled();
  });

  it("updates a backward-compatible subscription payload by user id", async () => {
    await expect(
      updateSubscriptionAction({
        auth: "auth",
        endpoint: "https://push.test/sub",
        id: "sub-1",
        keys: { auth: "auth", p256dh: "p256dh" },
        p256dh: "p256dh",
        userId: "user-2",
      }),
    ).resolves.toEqual({ success: true });

    expect(savePushSubscriptionMock).toHaveBeenCalledWith({
      endpoint: "https://push.test/sub",
      keys: { auth: "auth", p256dh: "p256dh" },
      userId: "user-2",
    });
  });

  it("deletes one subscription or all subscriptions for the current user", async () => {
    await expect(deleteSubscriptionAction("https://push.test/sub")).resolves.toEqual({
      success: true,
    });
    expect(deletePushSubscriptionMock).toHaveBeenCalledWith("user-1", "https://push.test/sub");

    await expect(deleteSubscriptionAction()).resolves.toEqual({ success: true });
    expect(deleteAllPushSubscriptionsMock).toHaveBeenCalledWith("user-1");
  });

  it("falls back to no subscription status on auth/service errors", async () => {
    getCurrentUserIdMock.mockRejectedValueOnce(new Error("unauthorized"));

    await expect(getSubscriptionStatusAction()).resolves.toEqual({ hasSubscription: false });
    expect(getUserSubscriptionStatusMock).not.toHaveBeenCalled();
  });
});
