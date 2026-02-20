import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    reminder: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    pushSubscription: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/webpush", () => ({
  PushNotificationService: {
    fromEnvironment: () => ({
      sendNotifications: vi.fn().mockResolvedValue({
        results: [],
        successCount: 0,
        failureCount: 0,
      }),
    }),
    shouldDeleteSubscription: () => false,
  },
}));

vi.mock("./lib/partitionPushSubscriptions", () => ({
  partitionPushSubscriptions: () => ({ web: [], expo: [] }),
}));

vi.mock("./lib/expoPush", () => ({
  sendExpoPushNotifications: vi.fn().mockResolvedValue({
    successCount: 0,
    failureCount: 0,
    deletedCount: 0,
    temporaryFailureCount: 0,
  }),
}));

describe("training-reminders-sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  describe("sendTrainingReminders", () => {
    it("возвращает sent/skipped/errors", async () => {
      const { sendTrainingReminders } = await import("./training-reminders-sender");

      const result = await sendTrainingReminders();

      expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
    });

    it("вызывает prisma.reminder.findMany", async () => {
      const { sendTrainingReminders } = await import("./training-reminders-sender");

      await sendTrainingReminders();

      expect(mockFindMany).toHaveBeenCalled();
      const callArg = mockFindMany.mock.calls[0]?.[0];
      expect(callArg?.where).toEqual({ type: "training", enabled: true });
    });
  });
});
