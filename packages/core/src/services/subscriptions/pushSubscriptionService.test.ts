import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
  getUserSubscriptionStatus,
  getPushSubscriptionStatusForEndpoints,
  getUserSubscriptionCount,
  getUserSubscriptions,
} from "./pushSubscriptionService";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    pushSubscription: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
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

describe("savePushSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates existing subscription by endpoint", async () => {
    mockFindFirst.mockResolvedValue({
      id: "sub-1",
      endpoint: "https://push.example.com/1",
    });
    mockUpdate.mockResolvedValue({ id: "sub-1" });

    const result = await savePushSubscription({
      userId: "user-1",
      endpoint: "https://push.example.com/1",
      keys: { p256dh: "key1", auth: "auth1" },
    });

    expect(mockUpdate).toHaveBeenCalled();
    expect(result).toEqual({ id: "sub-1" });
  });

  it("creates new subscription when not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "sub-new" });

    const result = await savePushSubscription({
      userId: "user-1",
      endpoint: "https://push.example.com/new",
      keys: { p256dh: "k", auth: "a" },
    });

    expect(mockCreate).toHaveBeenCalled();
    expect(result).toEqual({ id: "sub-new" });
  });
});

describe("deletePushSubscriptionByEndpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deletedCount", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deletePushSubscriptionByEndpoint(
      "user-1",
      "https://push.example.com/1",
    );

    expect(result).toEqual({ success: true, deletedCount: 1 });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", endpoint: "https://push.example.com/1" },
    });
  });
});

describe("deleteAllPushSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes all user subscriptions", async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 });

    const result = await deleteAllPushSubscriptions("user-1");

    expect(result).toEqual({ success: true, deletedCount: 3 });
  });
});

describe("getUserSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns hasSubscription true without Expo when only web endpoint", async () => {
    mockFindMany.mockResolvedValue([{ endpoint: "https://fcm.googleapis.com/fcm/send/x" }]);

    const result = await getUserSubscriptionStatus("user-1");

    expect(result).toEqual({
      hasSubscription: true,
      hasExpoPushSubscription: false,
    });
  });

  it("returns hasExpoPushSubscription when Expo token present", async () => {
    mockFindMany.mockResolvedValue([
      { endpoint: "https://web.example/push" },
      { endpoint: "ExponentPushToken[abc]" },
    ]);

    const result = await getUserSubscriptionStatus("user-1");

    expect(result).toEqual({
      hasSubscription: true,
      hasExpoPushSubscription: true,
    });
  });

  it("returns false when none", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getUserSubscriptionStatus("user-1");

    expect(result).toEqual({
      hasSubscription: false,
      hasExpoPushSubscription: false,
    });
  });
});

describe("getPushSubscriptionStatusForEndpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns determined false when endpoints empty", async () => {
    const result = await getPushSubscriptionStatusForEndpoints("user-1", []);
    expect(result).toEqual({
      hasThisDeviceSubscription: false,
      determined: false,
    });
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("returns hasThisDeviceSubscription when endpoint matches", async () => {
    mockCount.mockResolvedValue(1);

    const result = await getPushSubscriptionStatusForEndpoints("user-1", [
      "ExponentPushToken[abc]",
    ]);

    expect(result).toEqual({
      hasThisDeviceSubscription: true,
      determined: true,
    });
    expect(mockCount).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        endpoint: { in: ["ExponentPushToken[abc]"] },
      },
    });
  });

  it("returns false when count is zero", async () => {
    mockCount.mockResolvedValue(0);

    const result = await getPushSubscriptionStatusForEndpoints("user-1", [
      "ExponentPushToken[ghost]",
    ]);

    expect(result).toEqual({
      hasThisDeviceSubscription: false,
      determined: true,
    });
  });
});

describe("getUserSubscriptionCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns subscriptionCount", async () => {
    mockCount.mockResolvedValue(2);

    const result = await getUserSubscriptionCount("user-1");

    expect(result).toEqual({ subscriptionCount: 2 });
  });
});

describe("getUserSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns subscriptions list", async () => {
    mockFindMany.mockResolvedValue([
      { id: "s1", endpoint: "ep1", createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await getUserSubscriptions("user-1");

    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0].id).toBe("s1");
  });
});
