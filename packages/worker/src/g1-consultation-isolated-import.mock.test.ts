/**
 * AG1 WORK070 import observation: opt-in Vitest sandbox, NOT a bare Node import.
 * Hoisted mocks intercept queues, ioredis, Prisma and BullMQ BEFORE dynamic imports.
 * Proves package export resolution and actual consultation worker source wiring.
 * No real Redis, queue constructor, provider, Prisma query or socket operation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  redisConstructor: vi.fn(),
  queueConstructor: vi.fn(),
  queueAdd: vi.fn(),
  queueRemove: vi.fn(),
  queueGetJob: vi.fn(),
  prismaFindLog: vi.fn(),
  prismaFindOutbox: vi.fn(),
  prismaFindAttempt: vi.fn(),
  prismaWrite: vi.fn(),
  mailTransport: vi.fn(),
  smtpTransport: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  connection: Object.freeze({ __inProcessMock__: "NO_REDIS_CLIENT" }),
  installedWorkers: [] as {
    name: string;
    process: (job: { data: { emailLogId: string } }) => Promise<void>;
    concurrency: number;
    connection: unknown;
  }[],
}));

// Fail closed if the real queues barrel or ioredis constructor escapes the mock.
vi.mock("ioredis", () => ({
  Redis: class {
    constructor() {
      m.redisConstructor();
      throw new Error("MOCK_BOUNDARY_REDIS_CONSTRUCTOR_FORBIDDEN");
    }
  },
  default: class {
    constructor() {
      m.redisConstructor();
      throw new Error("MOCK_BOUNDARY_REDIS_CONSTRUCTOR_FORBIDDEN");
    }
  },
}));
vi.mock("bullmq", () => ({
  Queue: class {
    constructor() {
      m.queueConstructor();
      throw new Error("MOCK_BOUNDARY_QUEUE_CONSTRUCTOR_FORBIDDEN");
    }
  },
  Worker: class {
    constructor(
      name: string,
      process: (job: { data: { emailLogId: string } }) => Promise<void>,
      opts: { concurrency: number; connection: unknown },
    ) {
      m.installedWorkers.push({
        name, process, concurrency: opts.concurrency, connection: opts.connection,
      });
    }
    on() { return this; }
  },
}));
vi.mock("@gafus/queues", () => {
  const queue = { add: m.queueAdd, remove: m.queueRemove, getJob: m.queueGetJob };
  return {
    connection: m.connection,
    consultationMailQueue: queue,
    consultationReminderQueue: queue,
    consultationSlaQueue: queue,
    CONSULTATION_MAIL_JOB_ID: (id: string) => "mail:" + id,
    CONSULTATION_REMINDER_JOB_ID: (id: string) => "reminder:" + id,
    CONSULTATION_SLA_JOB_ID: (id: string) => "sla:" + id,
    removeConsultationReminderJob: m.queueRemove,
    removeConsultationSlaJob: m.queueRemove,
  };
});
vi.mock("@gafus/prisma", () => {
  // Pure synthetic enum/type surface; do not even import @prisma/client.
  const enumValue = new Proxy({}, {
    get: (_target, key) => typeof key === "string" ? key : undefined,
  });
  const prisma = {
    consultationEmailLog: {
      findUnique: m.prismaFindLog, updateMany: m.prismaWrite,
    },
    transactionalMailOutbox: {
      findUnique: m.prismaFindOutbox, updateMany: m.prismaWrite,
    },
    transactionalMailAttempt: {
      findUnique: m.prismaFindAttempt, updateMany: m.prismaWrite,
    },
  };
  const fields: Record<string, unknown> = {
    prisma,
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {
        code = "P2002";
      },
      PrismaClientValidationError: class extends Error {},
      sql: () => { throw new Error("MOCK_BOUNDARY_PRISMA_SQL_FORBIDDEN"); },
    },
  };
  return new Proxy(fields, {
    get: (target, name) => {
      if (typeof name !== "string") return undefined;
      if (name === "then") return undefined;
      return name in target ? target[name] : enumValue;
    },
    has: (_target, name) => typeof name === "string",
  });
});
// Mailer imports are real; only the underlying provider/SMTP transport is mocked.
vi.mock("../../mailer/src/resend", () => ({
  sendResendMail: m.mailTransport,
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      m.smtpTransport(...args);
      throw new Error("MOCK_BOUNDARY_SMTP_TRANSPORT_FORBIDDEN");
    },
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(), warn: m.warn, error: m.error, success: m.success,
  }),
  createWorkerLogger: () => ({
    info: vi.fn(), warn: m.warn, error: m.error, success: m.success,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.installedWorkers.length = 0;
  m.prismaFindLog.mockResolvedValue(null);
  m.prismaFindOutbox.mockResolvedValue(null);
  m.prismaFindAttempt.mockResolvedValue(null);
});
function assertNoRealOrSyntheticIO(): void {
  expect(m.redisConstructor).not.toHaveBeenCalled();
  expect(m.queueConstructor).not.toHaveBeenCalled();
  expect(m.queueAdd).not.toHaveBeenCalled();
  expect(m.queueRemove).not.toHaveBeenCalled();
  expect(m.queueGetJob).not.toHaveBeenCalled();
  expect(m.prismaWrite).not.toHaveBeenCalled();
  expect(m.mailTransport).not.toHaveBeenCalled();
  expect(m.smtpTransport).not.toHaveBeenCalled();
}

describe("AG1 approved ISOLATED consultation import, no Redis/network", () => {
  it("actual public Core and mailer package specifiers resolve with hoisted mocks", async () => {
    // Explicit bounded imports; no broad unguarded Node import of worker/app.
    const [core, mailer] = await Promise.all([
      import("@gafus/core/services/consultation"),
      import("@gafus/mailer"),
    ]);
    expect(typeof core.processConsultationEmailLog).toBe("function");
    expect(typeof core.reconcileConsultationEmailLog).toBe("function");
    expect(typeof core.sendConsultationEmailFromLog).toBe("function");
    expect(typeof mailer.sendTransactionalMailWithDisposition).toBe("function");
    expect(typeof mailer.processDueTransactionalMailOutbox).toBe("function");
    expect(typeof mailer.enqueueTransactionalMail).toBe("function");
    const underlyingTransport = await import("../../mailer/src/resend");
    expect(underlyingTransport.sendResendMail).toBe(m.mailTransport);
    assertNoRealOrSyntheticIO();
  });
  it("real bounded Core process handles missing log via mock Prisma, zero enqueue/provider", async () => {
    const { processConsultationEmailLog, reconcileConsultationEmailLog } =
      await import("@gafus/core/services/consultation");
    expect(await processConsultationEmailLog("synthetic-log-id")).toBe("missing");
    expect(await reconcileConsultationEmailLog("synthetic-log-id")).toBe("missing");
    expect(m.prismaFindLog).toHaveBeenCalledTimes(2);
    expect(m.prismaFindLog).toHaveBeenNthCalledWith(1, {
      where: { id: "synthetic-log-id" },
    });
    assertNoRealOrSyntheticIO();
  });
  it("real Core terminal FAILED log does not touch queues or provider", async () => {
    const { processConsultationEmailLog } =
      await import("@gafus/core/services/consultation");
    m.prismaFindLog.mockResolvedValueOnce({
      id: "synthetic-log-failed",
      type: "CLIENT_BOOKING_RECEIVED", status: "FAILED",
      attempts: 0, sentAt: null,
    });
    expect(await processConsultationEmailLog("synthetic-log-failed")).toBe("failed");
    expect(m.prismaFindOutbox).not.toHaveBeenCalled();
    expect(m.prismaFindAttempt).not.toHaveBeenCalled();
    assertNoRealOrSyntheticIO();
  });
  it("actual worker source receives Core missing outcome through inert BullMQ worker", async () => {
    const { startConsultationMailWorker } =
      await import("./consultation-mail-worker");
    startConsultationMailWorker();
    expect(m.installedWorkers).toHaveLength(1);
    const worker = m.installedWorkers[0]!;
    expect(worker.name).toBe("consultation-mail");
    expect(worker.concurrency).toBe(2);
    expect(worker.connection).toBe(m.connection);
    await worker.process({ data: { emailLogId: "synthetic-log-id" } });
    expect(m.prismaFindLog).toHaveBeenCalledExactlyOnceWith({
      where: { id: "synthetic-log-id" },
    });
    expect(m.warn).toHaveBeenCalledOnce();
    assertNoRealOrSyntheticIO();
  });
  it("missing outcome duplicate jobs remain mocked and never schedule queue work", async () => {
    const { startConsultationMailWorker } =
      await import("./consultation-mail-worker");
    startConsultationMailWorker();
    const worker = m.installedWorkers[0]!;
    await Promise.all([
      worker.process({ data: { emailLogId: "synthetic-duplicate" } }),
      worker.process({ data: { emailLogId: "synthetic-duplicate" } }),
    ]);
    assertNoRealOrSyntheticIO();
    expect(m.prismaFindLog.mock.calls.length).toBeGreaterThan(0);
  });
});
