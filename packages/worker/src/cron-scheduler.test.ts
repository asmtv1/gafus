import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSchedule = vi.fn();
const mockOperationalError = vi.fn();
const mockOperationalInfo = vi.fn();
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
  createWebLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
  }),
  createWorkerLogger: () => ({
    info: mockOperationalInfo,
    warn: vi.fn(),
    error: mockOperationalError,
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

const mockProcessMailOutbox = vi.fn().mockResolvedValue({ processed: 0 });
vi.mock("@gafus/mailer", () => ({
  processDueTransactionalMailOutbox: (...args: unknown[]) => mockProcessMailOutbox(...args),
}));
// Keep unrelated NPD worker runtime imports out of this cron wiring unit test.
vi.mock("./npd-worker", () => ({
  processDueNpdReceiptOperations: vi.fn().mockResolvedValue({ processed: 0 }),
}));
vi.mock("./npd-email-worker", () => ({
  processDueNpdReceiptEmailDeliveries: vi.fn().mockResolvedValue({ processed: 0 }),
}));
const mockMonitorMailDelivery = vi.fn().mockResolvedValue(undefined);
vi.mock("./mail-delivery-monitor", () => ({
  monitorMailDelivery: (...args: unknown[]) => mockMonitorMailDelivery(...args),
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

const mockReconcileConsultationEmailLog = vi.fn().mockResolvedValue("sent");
vi.mock("@gafus/core/services/consultation", () => ({
  reconcileConsultationEmailLog: (...args: unknown[]) =>
    mockReconcileConsultationEmailLog(...args),
  reconcileMissedConsultationReminders: vi.fn().mockResolvedValue({
    checked: 0,
    triggered30m: 0,
    triggeredStart: 0,
  }),
}));

describe("cron-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("startCronJobs", () => {
    it("регистрирует 10 базовых cron задач с очисткой аккаунта по умолчанию", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();

      expect(mockSchedule).toHaveBeenCalledTimes(10);
    }, 15_000);

    it("keeps an explicit emergency OFF switch for account cleanup without disabling mail", async () => {
      vi.stubEnv("ACCOUNT_STORAGE_CLEANUP_ENABLED", "false");
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      expect(mockSchedule).toHaveBeenCalledTimes(9);
      expect(mockSchedule.mock.calls.some(call => call[0] === "* * * * *")).toBe(true);
    });

    it("registers account cleanup when explicitly enabled", async () => {
      vi.stubEnv("ACCOUNT_STORAGE_CLEANUP_ENABLED", "true");
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      expect(mockSchedule).toHaveBeenCalledTimes(10);
    });

    it("rejects malformed cleanup flag rather than unexpectedly enabling erasure", async () => {
      vi.stubEnv("ACCOUNT_STORAGE_CLEANUP_ENABLED", "maybe");
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      expect(mockSchedule).toHaveBeenCalledTimes(9);
    });

    it("runs the deferred email outbox every minute", async () => {
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      const due = mockSchedule.mock.calls.find((call) => call[0] === "* * * * *" && call[2]?.timezone === "UTC");
      expect(due).toBeDefined();
      await due?.[1]();
      await vi.waitFor(() => expect(mockProcessMailOutbox).toHaveBeenCalledWith({
        batchSize: 10, onTerminalCommitted: expect.any(Function),
      }));
      const hook = mockProcessMailOutbox.mock.calls[0][0].onTerminalCommitted as
        (key: string) => Promise<void>;
      await hook("consultation-log-A");
      expect(mockReconcileConsultationEmailLog).toHaveBeenCalledWith("log-A");
      await hook("other-log-A");
      await hook("consultation-bad?=key");
      expect(mockReconcileConsultationEmailLog).toHaveBeenCalledOnce();
    });

    it("WORK070 stranded callback failure emits sanitized operational manual-review alert", async () => {
      const { startCronJobs } = await import("./cron-scheduler");
      const PRIVATE = "PRIVATE_PROVIDER_RECIPIENT_SECRET_STACK";
      mockProcessMailOutbox.mockResolvedValueOnce({
        processed: 1, sent: 1, reconciliationFailures: 1,
        rawError: PRIVATE,
      });
      startCronJobs();
      const due = mockSchedule.mock.calls.find((call) =>
        call[0] === "* * * * *" && call[2]?.timezone === "UTC");
      await due?.[1]();
      await vi.waitFor(() => expect(mockOperationalError).toHaveBeenCalledExactlyOnceWith(
        "CONSULTATION_MAIL_RECONCILIATION_MANUAL_REVIEW",
      ));
      expect(JSON.stringify(mockOperationalError.mock.calls)).not.toContain(PRIVATE);
      expect(JSON.stringify(mockOperationalError.mock.calls)).not.toContain("stack");
      expect(JSON.stringify(mockOperationalInfo.mock.calls)).not.toContain(PRIVATE);
    });

    it("terminal outbox with queued Core conflict is escalated, not silently accepted", async () => {
      const { startCronJobs } = await import("./cron-scheduler");
      mockReconcileConsultationEmailLog.mockResolvedValueOnce("queued");
      startCronJobs();
      const due = mockSchedule.mock.calls.find((call) =>
        call[0] === "* * * * *" && call[2]?.timezone === "UTC");
      await due?.[1]();
      const hook = mockProcessMailOutbox.mock.calls[0][0].onTerminalCommitted as
        (key: string) => Promise<void>;
      await expect(hook("consultation-log-A")).rejects.toThrow(
        "CONSULTATION_MAIL_TERMINAL_REVIEW",
      );
      expect(mockReconcileConsultationEmailLog).toHaveBeenCalledExactlyOnceWith("log-A");
    });

    it("checks unresolved mail every 15 minutes", async () => {
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      const mailCron = mockSchedule.mock.calls.find((call) => call[0] === "3,18,33,48 * * * *");
      expect(mailCron).toBeDefined();
      await mailCron?.[1]();
      expect(mockMonitorMailDelivery).toHaveBeenCalledOnce();
    });

    it("запускает reconciliation pending app subscription в cron подписок", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();
      const subscriptionCron = mockSchedule.mock.calls.find((call) => call[0] === "*/15 * * * *");
      await subscriptionCron?.[1]();

      expect(mockReconcileStaleYookassaPendingAppSubscriptions)
        .toHaveBeenCalledWith({ batchSize: 100 });
      expect(mockProcessDueYookassaAppSubscriptionRenewals)
        .toHaveBeenCalledWith({ batchSize: 100 });
    });
  });
});
