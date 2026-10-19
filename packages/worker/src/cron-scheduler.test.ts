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
  createWebLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
  }),
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

const mockProcessMailOutbox = vi.fn().mockResolvedValue({ processed: 0 });
vi.mock("@gafus/mailer", () => ({
  processDueTransactionalMailOutbox: (...args: unknown[]) => mockProcessMailOutbox(...args),
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

vi.mock("@gafus/core/services/consultation", () => ({
  reconcileMissedConsultationReminders: vi.fn().mockResolvedValue({
    checked: 0,
    triggered30m: 0,
    triggeredStart: 0,
  }),
}));

const mockMediaRecovery = vi.hoisted(() => ({
  factory: vi.fn(), execute: vi.fn().mockResolvedValue({dispatched:0}),
}));
vi.mock("./cloudru-media-recovery", () => ({
  createCloudruMediaRecovery: (...args: unknown[]) => mockMediaRecovery.factory(...args),
}));

describe("cron-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCronJobs", () => {
    it("регистрирует 9 базовых cron задач", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();

      expect(mockSchedule).toHaveBeenCalledTimes(9);
    }, 15_000);

    it("uses five-minute work-aware recovery instead of unconditional minute launches",async()=>{
      vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");
      mockMediaRecovery.factory.mockReturnValue(mockMediaRecovery.execute);
      try {
        const {startCronJobs}=await import("./cron-scheduler");
        startCronJobs();
        const recovery=mockSchedule.mock.calls.filter(([expr,fn,opts]) =>
          expr==="*/5 * * * *" && opts?.timezone==="UTC");
        expect(recovery).toHaveLength(1);
        await recovery[0]![1]();
        await vi.waitFor(()=>expect(mockMediaRecovery.execute).toHaveBeenCalledOnce());
        expect(mockMediaRecovery.factory).toHaveBeenCalledOnce();
        const cronCode=mockSchedule.mock.calls
          .filter(([expr,fn])=>String(fn).includes("cloudru-media-recovery"))
          .map(([expr])=>expr);
        expect(cronCode).toEqual(["*/5 * * * *"]);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("runs the deferred email outbox every minute", async () => {
      const { startCronJobs } = await import("./cron-scheduler");
      startCronJobs();
      const due = mockSchedule.mock.calls.find((call) => call[0] === "* * * * *" && call[2]?.timezone === "UTC");
      expect(due).toBeDefined();
      await due?.[1]();
      await vi.waitFor(() => expect(mockProcessMailOutbox).toHaveBeenCalledWith({ batchSize: 10 }));
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

      expect(mockReconcileStaleYookassaPendingAppSubscriptions).toHaveBeenCalledWith({ batchSize: 100 });
      expect(mockProcessDueYookassaAppSubscriptionRenewals).toHaveBeenCalledWith({ batchSize: 100 });
    });
  });
});
