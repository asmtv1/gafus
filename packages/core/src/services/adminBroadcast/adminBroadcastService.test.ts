import { describe, expect, it, beforeEach, vi } from "vitest";

import { sendBroadcastPush } from "./adminBroadcastService";

const mockPushSubscriptionFindMany = vi.fn();
const mockPushSubscriptionDeleteMany = vi.fn();
const mockSendNotifications = vi.fn();
const mockShouldDeleteSubscription = vi.fn();
const mockPartitionPushSubscriptions = vi.fn();
const mockSendExpoPushNotifications = vi.fn();
const mockSendRustorePushNotifications = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => mockPushSubscriptionFindMany(...args),
      deleteMany: (...args: unknown[]) => mockPushSubscriptionDeleteMany(...args),
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

vi.mock("@gafus/webpush", () => ({
  PushNotificationService: {
    fromEnvironment: () => ({
      sendNotifications: (...args: unknown[]) => mockSendNotifications(...args),
    }),
    shouldDeleteSubscription: (...args: unknown[]) => mockShouldDeleteSubscription(...args),
  },
  partitionPushSubscriptions: (...args: unknown[]) => mockPartitionPushSubscriptions(...args),
  sendExpoPushNotifications: (...args: unknown[]) => mockSendExpoPushNotifications(...args),
  sendRustorePushNotifications: (...args: unknown[]) => mockSendRustorePushNotifications(...args),
}));

describe("sendBroadcastPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPartitionPushSubscriptions.mockImplementation(
      (subs: { endpoint: string; keys: unknown }[]) => ({
        web: subs.map((s) => {
          const keys = s.keys as { p256dh: string; auth: string };
          return { endpoint: s.endpoint, keys };
        }),
        expo: [],
        rustore: [],
      }),
    );
    mockSendExpoPushNotifications.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      deletedCount: 0,
      temporaryFailureCount: 0,
    });
    mockSendRustorePushNotifications.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      deletedCount: 0,
      temporaryFailureCount: 0,
    });
  });

  it("returns error when title empty", async () => {
    const result = await sendBroadcastPush("", "Body");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Заголовок");
  });

  it("returns error when body empty", async () => {
    const result = await sendBroadcastPush("Title", "");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Текст");
  });

  it("returns zero counts when no subscriptions", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    const result = await sendBroadcastPush("Title", "Body");

    expect(result.success).toBe(true);
    expect(result.totalUsers).toBe(0);
  });

  it("sends to subscriptions and returns counts on success", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      {
        endpoint: "https://push.example.com/1",
        keys: { p256dh: "key1", auth: "auth1" },
        userId: "u1",
      },
    ]);
    mockPartitionPushSubscriptions.mockReturnValue({
      web: [{ endpoint: "https://push.example.com/1", keys: { p256dh: "key1", auth: "auth1" } }],
      expo: [],
      rustore: [],
    });
    mockSendNotifications.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      results: [{ endpoint: "https://push.example.com/1", success: true }],
    });
    mockShouldDeleteSubscription.mockReturnValue(false);

    const result = await sendBroadcastPush("Title", "Body");

    expect(result.success).toBe(true);
    expect(result.totalUsers).toBe(1);
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockSendNotifications).toHaveBeenCalled();
    expect(mockSendExpoPushNotifications).not.toHaveBeenCalled();
    expect(mockSendRustorePushNotifications).not.toHaveBeenCalled();
  });

  it("deletes invalid subscriptions when shouldDeleteSubscription returns true", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      {
        endpoint: "https://invalid.example.com/1",
        keys: { p256dh: "k", auth: "a" },
        userId: "u1",
      },
    ]);
    mockPartitionPushSubscriptions.mockReturnValue({
      web: [{ endpoint: "https://invalid.example.com/1", keys: { p256dh: "k", auth: "a" } }],
      expo: [],
      rustore: [],
    });
    mockSendNotifications.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      results: [
        {
          endpoint: "https://invalid.example.com/1",
          success: false,
          error: "Subscription expired",
        },
      ],
    });
    mockShouldDeleteSubscription.mockReturnValue(true);
    mockPushSubscriptionDeleteMany.mockResolvedValue({ count: 1 });

    const result = await sendBroadcastPush("Title", "Body");

    expect(result.success).toBe(true);
    expect(mockPushSubscriptionDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ["https://invalid.example.com/1"] } },
    });
  });
});
