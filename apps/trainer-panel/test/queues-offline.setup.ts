/**
 * Trainer-panel Vitest suites mount the actual Hono/Core read paths using
 * synthetic Prisma fixtures. Importing @gafus/queues would otherwise
 * construct BullMQ and ioredis at module evaluation and retry localhost:6379.
 * Intercept the transport boundary only: never mock Core, Hono, or Prisma.
 * An unexpected queue/Redis operation must fail rather than silently pass.
 */
import { vi } from "vitest";

vi.mock("@gafus/queues", () => {
  const unavailable = () => {
    throw new Error("TRAINER_TEST_UNEXPECTED_REDIS_OR_QUEUE_IO");
  };
  const connection = new Proxy(Object.freeze({ status: "wait" }), {
    get(target, key) {
      if (key === "then") return undefined;
      if (typeof key === "string" && key in target) return target[key as keyof typeof target];
      return unavailable;
    },
  });
  const queue = Object.freeze({
    add: unavailable,
    getJob: unavailable,
    remove: unavailable,
    getJobs: unavailable,
    getJobCounts: unavailable,
    close: unavailable,
  });
  return new Proxy({ connection, pushQueue: queue }, {
    get(target, key) {
      if (key === "then") return undefined;
      if (key === "connection") return target.connection;
      if (key === "pushQueue") return target.pushQueue;
      if (typeof key !== "string") return undefined;
      if (key.endsWith("_QUEUE_NAME")) return "offline-test-queue";
      if (key.endsWith("_JOB_ID") || key.startsWith("enqueue") || key.startsWith("remove"))
        return unavailable;
      return queue;
    },
  });
});
