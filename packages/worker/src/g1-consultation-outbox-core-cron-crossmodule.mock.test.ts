/**
 * WORK070 distinct in-process trust boundary: actual source mailer OUTBOX
 * -> actual source Core consultationEmailDelivery.reconcile
 * -> actual source worker cron alert. All IO is synthetic, pre-import mocked.
 * Does NOT build, import broad packages, connect to Redis, Prisma or provider.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  schedule: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  outboxFindFirst: vi.fn(), outboxFindUnique: vi.fn(), outboxUpdateMany: vi.fn(),
  attemptFindUnique: vi.fn(), logFindUnique: vi.fn(), logUpdateMany: vi.fn(),
  stubTransport: vi.fn(), providerPost: vi.fn(), queueAdd: vi.fn(),
  actualOutbox: vi.fn(), actualReconcile: vi.fn(),
  redisConstructor: vi.fn(), bullQueueConstructor: vi.fn(),
}));
vi.mock("ioredis", () => ({
  Redis: class { constructor() { m.redisConstructor(); throw Error("REDIS_FORBIDDEN"); } },
}));
vi.mock("bullmq", () => ({
  Queue: class { constructor() { m.bullQueueConstructor(); throw Error("QUEUE_FORBIDDEN"); } },
}));
vi.mock("@gafus/queues", () => {
  const queue = { add: m.queueAdd };
  return { connection: {}, consultationMailQueue: queue };
});
vi.mock("@gafus/prisma", () => ({
  ConsultationEmailStatus: { PENDING: "PENDING", FAILED: "FAILED", SENT: "SENT" },
  prisma: {
    transactionalMailOutbox: {
      findFirst: m.outboxFindFirst, findUnique: m.outboxFindUnique,
      updateMany: m.outboxUpdateMany,
    },
    transactionalMailAttempt: { findUnique: m.attemptFindUnique },
    consultationEmailLog: {
      findUnique: m.logFindUnique, updateMany: m.logUpdateMany,
    },
  },
}));
vi.mock("../../mailer/src/resend", () => ({ sendResendMail: m.stubTransport }));
vi.mock("../../core/src/services/consultation/consultationTransactionalMail", () => ({
  sendConsultationEmailFromLog: () => {
    throw new Error("CONSULTATION_SEND_FORBIDDEN");
  },
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: m.info, warn: m.warn, error: m.error, success: vi.fn(),
  }),
  createWebLogger: () => ({
    info: m.info, warn: m.warn, error: m.error, success: vi.fn(),
  }),
}));
vi.mock("node-cron", () => ({
  default: { schedule: (...args: unknown[]) => m.schedule(...args) },
}));
vi.mock("@gafus/mailer", () => ({
  processDueTransactionalMailOutbox: (...args: unknown[]) => m.actualOutbox(...args),
}));
vi.mock("@gafus/core/services/consultation", () => ({
  reconcileConsultationEmailLog: (...args: unknown[]) => m.actualReconcile(...args),
  reconcileMissedConsultationReminders: vi.fn().mockResolvedValue({
    checked: 0, triggered30m: 0, triggeredStart: 0,
  }),
}));
// Every unrelated cron import must be inert before importing actual scheduler.
vi.mock("@gafus/core/services/questions", () => ({
  reconcileQuestionNotifications: vi.fn(), cleanupUnusedQuestionPhotos: vi.fn(),
}));
vi.mock("@gafus/core/services/accountCleanup", () => ({
  processAccountStorageCleanup: vi.fn(),
}));
vi.mock("@gafus/core/services/feed", () => ({
  refreshCurrentSmartFeedStats: vi.fn(),
  refreshCurrentSmartAuthorAffinities: vi.fn(),
  getCurrentSmartFeedHealth: vi.fn(),
  pruneCurrentSmartFeedSignals: vi.fn(),
  trainCurrentSmartFeedRanker: vi.fn(),
}));
vi.mock("@gafus/reengagement", () => ({
  scheduleReengagementCampaigns: vi.fn(), recordDailyMetrics: vi.fn(),
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  reconcileAppleAppSubscriptionsFromServer: vi.fn(),
  reconcileStaleYookassaPendingAppSubscriptions: vi.fn(),
}));
vi.mock("./training-reminder-schedule", () => ({
  TRAINING_REMINDER_CRON_EXPRESSION: "0 * * * *",
}));
vi.mock("./training-reminders-sender", () => ({ sendTrainingReminders: vi.fn() }));
vi.mock("./app-subscription-renewals", () => ({
  processDueYookassaAppSubscriptionRenewals: vi.fn(),
}));
vi.mock("./app-subscription-renewal-reminders", () => ({
  sendYookassaAppSubscriptionRenewalReminders: vi.fn(),
}));
vi.mock("./npd-worker", () => ({ processDueNpdReceiptOperations: vi.fn() }));
vi.mock("./npd-email-worker", () => ({
  processDueNpdReceiptEmailDeliveries: vi.fn(),
}));
vi.mock("./gafus-notifications", () => ({ processGafusNotifications: vi.fn() }));
vi.mock("./mail-delivery-monitor", () => ({ monitorMailDelivery: vi.fn() }));

const PRIVATE = "PRIVATE_RECIPIENT_EMAIL_TOKEN_STACK";
const acceptedAt = new Date("2026-10-21T12:01:02.000Z");
const NOW = new Date();
const ID = "consultation-log-A";
interface Outbox {
  id: string; status: string; attempts: number; leaseOwner: string | null;
  leaseExpiresAt: Date | null; nextAttemptAt: Date;
  createdAt: Date; expiresAt: Date;
  ciphertext: string | null; nonce: string | null; authTag: string | null;
  acceptedAt: Date | null; lastErrorCode?: string | null;
};
interface Log {
  id: string; status: string; attempts: number; lastError: string | null;
  sentAt: Date | null; type: string;
};
let outbox: Outbox;
let log: Log;
let databaseFault = false;
let attempt: { status: string; providerMessageId: string; acceptedAt: Date } | null = null;
let makeEnvelope!: (input: {
  deliveryKey: string; to: string; subject: string; text: string;
}, id: string) => { ciphertext: string; nonce: string; authTag: string };
let startCron!: () => void;

beforeAll(async () => {
  // These explicit source imports run only after Vitest hoisted all mocks.
  const [mailer, core, worker] = await Promise.all([
    import("../../mailer/src/outbox"),
    import("../../core/src/services/consultation/consultationEmailDelivery"),
    import("./cron-scheduler"),
  ]);
  makeEnvelope = mailer.encryptMailPayload;
  m.actualOutbox.mockImplementation(mailer.processDueTransactionalMailOutbox);
  m.actualReconcile.mockImplementation(core.reconcileConsultationEmailLog);
  startCron = worker.startCronJobs;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MAIL_OUTBOX_ENABLED", "true");
  vi.stubEnv("MAIL_OUTBOX_ENCRYPTION_KEY", "66".repeat(32));
  vi.stubEnv("MAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key-not-real");
  vi.stubEnv("GAFUS_NOTIFICATIONS_ENABLED", "false");
  vi.stubEnv("FEED_SMART_ML_TRAIN_ENABLED", "false");
  vi.stubEnv("FEED_SMART_AFFINITY_ENABLED", "false");
  vi.stubEnv("FEED_SMART_MONITOR_ENABLED", "false");
  vi.stubEnv("FEED_SMART_STATS_ENABLED", "false");
  attempt = { status: "ACCEPTED", providerMessageId: "synthetic-accepted-id", acceptedAt };
  databaseFault = false;
  log = {
    id: "log-A", status: "PENDING", attempts: 1, sentAt: null,
    lastError: null, type: "CLIENT_BOOKING_RECEIVED",
  };
  const envelope = makeEnvelope({
    deliveryKey: ID, to: "synthetic@invalid.test",
    subject: "Test only", text: PRIVATE,
  }, ID);
  outbox = {
    id: ID, status: "PENDING", attempts: 0,
    leaseOwner: null, leaseExpiresAt: null,
    nextAttemptAt: new Date(NOW.getTime() - 20_000),
    createdAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...envelope, acceptedAt: null,
  };
  m.outboxFindFirst.mockImplementation(async () =>
    outbox.status === "PENDING" && outbox.nextAttemptAt <= NOW
      ? { id: outbox.id } : null,
  );
  m.outboxFindUnique.mockImplementation(async () => ({ ...outbox }));
  m.attemptFindUnique.mockImplementation(async () => attempt && { ...attempt });
  m.logFindUnique.mockImplementation(async () => ({ ...log }));
  m.outboxUpdateMany.mockImplementation(async (q: {
    where: { id: string; status?: string; leaseOwner?: string };
    data: Record<string, unknown>;
  }) => {
    if (q.where.id !== outbox.id ||
        q.where.status && q.where.status !== outbox.status ||
        q.where.leaseOwner && q.where.leaseOwner !== outbox.leaseOwner) {
      return { count: 0 };
    }
    const data = q.data;
    if (data.attempts && typeof data.attempts === "object") {
      outbox.attempts += (data.attempts as { increment: number }).increment;
    }
    Object.assign(outbox, { ...data, attempts: outbox.attempts });
    return { count: 1 };
  });
  m.logUpdateMany.mockImplementation(async (q: {
    where: { id: string; status: string; lastError?: string | null };
    data: Record<string, unknown>;
  }) => {
    if (databaseFault) throw new Error(PRIVATE);
    if (q.where.id !== log.id || q.where.status !== log.status ||
        q.where.lastError !== undefined && q.where.lastError !== log.lastError) {
      return { count: 0 };
    }
    Object.assign(log, q.data);
    return { count: 1 };
  });
  // Resend function is mocked at module load; an ACCEPTED prior attempt is
  // a pure idempotent return, never a provider request or fetch.
  m.stubTransport.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
const cronTick = async () => {
  startCron();
  const job = m.schedule.mock.calls.find(([expression, _fn, opts]) =>
    expression === "* * * * *" && opts?.timezone === "UTC");
  expect(job).toBeDefined();
  job![1]();
  await vi.waitFor(() => expect(m.actualOutbox).toHaveBeenCalledOnce());
  await vi.waitFor(() =>
    expect(m.info.mock.calls.some(([msg]) => msg === "Mail outbox processed")).toBe(true),
  );
};
const noExternalWork = () => {
  expect(m.redisConstructor).not.toHaveBeenCalled();
  expect(m.bullQueueConstructor).not.toHaveBeenCalled();
  expect(m.queueAdd).not.toHaveBeenCalled();
  expect(m.providerPost).not.toHaveBeenCalled();
  expect(JSON.stringify([m.error.mock.calls, m.info.mock.calls])).not.toContain(PRIVATE);
  expect(JSON.stringify(m.error.mock.calls)).not.toContain("stack");
};
describe("actual outbox -> actual Core -> actual cron manual review", () => {
  it("ACCEPTED but outbox expires: manual flag CAS + alert, no transport, no false FAILED/SENT", async () => {
    outbox.expiresAt = new Date(NOW.getTime() - 1);
    await cronTick();
    expect(outbox.status).toBe("EXPIRED");
    expect(log).toMatchObject({
      status: "PENDING", sentAt: null,
      lastError: "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT",
    });
    expect(m.actualReconcile).toHaveBeenCalledExactlyOnceWith("log-A");
    await vi.waitFor(() => expect(m.error).toHaveBeenCalledWith(
      "CONSULTATION_MAIL_RECONCILIATION_MANUAL_REVIEW",
    ));
    expect(m.stubTransport).not.toHaveBeenCalled();
    noExternalWork();
  });
  it("AG4-1202 UNKNOWN + expired outbox crosses actual Core to sanitized cron alert", async () => {
    outbox.expiresAt = new Date(NOW.getTime() - 1);
    attempt = {
      status: "UNKNOWN", providerMessageId: "", acceptedAt,
    };
    await cronTick();
    expect(outbox.status).toBe("EXPIRED");
    expect(log).toMatchObject({
      status: "PENDING", sentAt: null,
      lastError: "CONSULTATION_MAIL_TERMINAL_UNKNOWN",
    });
    expect(m.actualReconcile).toHaveBeenCalledExactlyOnceWith("log-A");
    await vi.waitFor(() => expect(m.error).toHaveBeenCalledExactlyOnceWith(
      "CONSULTATION_MAIL_RECONCILIATION_MANUAL_REVIEW",
    ));
    expect(m.stubTransport).not.toHaveBeenCalled();
    noExternalWork();
  });
  it("durable outbox SENT + Core DB callback fault -> alert; next cron does not resend", async () => {
    databaseFault = true;
    await cronTick();
    expect(outbox).toMatchObject({ status: "SENT", acceptedAt });
    expect(log).toMatchObject({ status: "PENDING", sentAt: null });
    await vi.waitFor(() => expect(m.error).toHaveBeenCalledWith(
      "CONSULTATION_MAIL_RECONCILIATION_MANUAL_REVIEW",
    ));
    expect(m.stubTransport).toHaveBeenCalledOnce();
    // Direct second invocation of the exact outbox source rechecks due state.
    const countBefore = m.stubTransport.mock.calls.length;
    const later = await m.actualOutbox({
      batchSize: 10,
      now: NOW,
      onTerminalCommitted: m.actualReconcile,
    });
    expect(later).toMatchObject({ processed: 0, sent: 0 });
    expect(m.stubTransport).toHaveBeenCalledTimes(countBefore);
    expect(log.status).toBe("PENDING");
    noExternalWork();
  });
  it("durable ACCEPTED + committed SENT + Core CAS success has no false alert", async () => {
    await cronTick();
    expect(outbox).toMatchObject({ status: "SENT", acceptedAt });
    expect(log).toMatchObject({
      status: "SENT", sentAt: acceptedAt, lastError: null,
    });
    expect(m.actualReconcile).toHaveBeenCalledExactlyOnceWith("log-A");
    expect(m.error).not.toHaveBeenCalled();
    noExternalWork();
  });
});
