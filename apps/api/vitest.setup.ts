import { vi } from "vitest";

process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Полный мок @gafus/queues: иначе при импорте app тянутся dist-очереди BullMQ и реальный ioredis
 * (vi.mock("ioredis") не перехватывает инстанс из workspace). Без Redis в CI — таймауты на запросах.
 */
const { mockRedisConnection, mockQueue } = vi.hoisted(() => {
  const mockRedisConnection = {
    on: vi.fn().mockReturnThis(),
    script: vi.fn().mockResolvedValue("sha"),
    evalsha: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
    quit: vi.fn().mockResolvedValue("OK"),
  };
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: "job-mock" }),
    close: vi.fn().mockResolvedValue(undefined),
    obliterate: vi.fn().mockResolvedValue(undefined),
  };
  return { mockRedisConnection, mockQueue };
});

vi.mock("@gafus/queues", () => ({
  connection: mockRedisConnection,
  default: mockRedisConnection,
  pushQueue: mockQueue,
  examCleanupQueue: mockQueue,
  videoTranscodingQueue: mockQueue,
  reengagementQueue: mockQueue,
  consentLogCleanupQueue: mockQueue,
  petPreventionReminderQueue: mockQueue,
  consultationSlaQueue: mockQueue,
  consultationMailQueue: mockQueue,
  CONSULTATION_SLA_JOB_ID: (bookingId: string) => `sla:${bookingId}`,
  CONSULTATION_MAIL_JOB_ID: (logId: string) => `mail:${logId}`,
}));

vi.mock("ioredis", () => {
  class MockRedis {
    constructor(..._args: unknown[]) {}

    on() {
      return this;
    }

    script() {
      return Promise.resolve("sha");
    }

    evalsha() {
      return Promise.resolve(1);
    }

    decr() {
      return Promise.resolve(1);
    }

    del() {
      return Promise.resolve(1);
    }

    ping() {
      return Promise.resolve("PONG");
    }
  }
  return { default: MockRedis, Redis: MockRedis };
});
