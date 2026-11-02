import { expect, it, vi } from "vitest";

it("trainer read suites never start Redis or enqueue real jobs", async () => {
  // setupFiles intercept this transport before actual Hono/Core imports.
  // When a test unexpectedly needs queue I/O, fail loudly instead of
  // allowing a real socket or silently pretending that a job was queued.
  const transport = await vi.importMock<{
    connection: { status: string; ping: () => unknown };
    pushQueue: { add: () => unknown };
  }>("@gafus/queues");
  expect(transport.connection.status).toBe("wait");
  expect(() => transport.connection.ping()).toThrow("TRAINER_TEST_UNEXPECTED_REDIS_OR_QUEUE_IO");
  expect(() => transport.pushQueue.add()).toThrow("TRAINER_TEST_UNEXPECTED_REDIS_OR_QUEUE_IO");
});
