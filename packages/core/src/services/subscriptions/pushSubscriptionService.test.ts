import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
  getUserSubscriptionStatus,
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

  it("returns hasSubscription true when subscription exists", async () => {
    mockFindFirst.mockResolvedValue({ id: "sub-1" });

    const result = await getUserSubscriptionStatus("user-1");

    expect(result).toEqual({ hasSubscription: true });
  });

  it("returns hasSubscription false when none", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getUserSubscriptionStatus("user-1");

    expect(result).toEqual({ hasSubscription: false });
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
