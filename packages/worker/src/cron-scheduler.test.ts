import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSchedule = vi.fn();
const mockReconcileStaleYookassaPendingAppSubscriptions = vi.fn().mockResolvedValue({
  checked: 0,
  activated: 0,
  expired: 0,
  deferred: 0,
});
const mockProcessDueYookassaAppSubscriptionRenewals = vi.fn().mockResolvedValue({
  processed: 0,
  skipped: 0,
  lockAcquired: true,
});

vi.mock("node-cron", () => ({
  default: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
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

vi.mock("@gafus/reengagement", () => ({
  scheduleReengagementCampaigns: vi.fn().mockResolvedValue({}),
  recordDailyMetrics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  reconcileStaleYookassaPendingAppSubscriptions: mockReconcileStaleYookassaPendingAppSubscriptions,
}));

vi.mock("./training-reminders-sender", () => ({
  sendTrainingReminders: vi.fn().mockResolvedValue({ sent: 0, skipped: 0, errors: 0 }),
}));

vi.mock("./app-subscription-renewals", () => ({
  processDueYookassaAppSubscriptionRenewals: mockProcessDueYookassaAppSubscriptionRenewals,
}));

vi.mock("./app-subscription-renewal-reminders", () => ({
  sendYookassaAppSubscriptionRenewalReminders: vi.fn().mockResolvedValue({
    sent: 0,
    skipped: 0,
    errors: 0,
  }),
}));

vi.mock("@gafus/core/services/consultation", () => ({
  reconcileMissedConsultationReminders: vi.fn().mockResolvedValue({
    checked: 0,
    triggered30m: 0,
    triggeredStart: 0,
  }),
}));

describe("cron-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCronJobs", () => {
    it("регистрирует 5 cron задач", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();

      expect(mockSchedule).toHaveBeenCalledTimes(5);
    });

    it("запускает reconciliation pending app subscription в cron подписок", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();
      const subscriptionCron = mockSchedule.mock.calls.find((call) => call[0] === "*/15 * * * *");
      await subscriptionCron?.[1]();

      expect(mockReconcileStaleYookassaPendingAppSubscriptions).toHaveBeenCalledWith({ batchSize: 100 });
      expect(mockProcessDueYookassaAppSubscriptionRenewals).toHaveBeenCalledWith({ batchSize: 100 });
    });
  });
});
