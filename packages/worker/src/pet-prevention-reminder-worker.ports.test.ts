import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  run: vi.fn(),
  enqueue: vi.fn(),
  readDue: vi.fn(),
  acknowledge: vi.fn(),
  createWorker: vi.fn(),
  subscribe: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  handler: null as null | ((job: { name: string; id: string }) => Promise<void>),
}));

vi.mock("@gafus/queues", () => ({ connection: { host: "synthetic-in-memory" } }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ info: m.info, success: m.success, error: m.error }),
}));
vi.mock("@gafus/core/services/petPrevention", () => ({
  checkAndSendPetPreventionReminders: m.run,
}));
vi.mock("@gafus/notifications-server/stepNotificationService", () => ({
  createImmediatePushNotification: m.enqueue,
}));
vi.mock("@gafus/pets-server/prevention-reminder-rows", () => ({
  readDuePetPreventionReminders: m.readDue,
  acknowledgePetPreventionQueuedTimes: m.acknowledge,
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      name: string,
      fn: (job: { name: string; id: string }) => Promise<void>,
      options: unknown,
    ) {
      m.createWorker(name, options);
      m.handler = fn;
    }
    on(event: string, fn: unknown) {
      m.subscribe(event, fn);
      return this;
    }
  },
}));

import { startPetPreventionReminderWorker } from "./pet-prevention-reminder-worker";

describe("pet prevention worker composes exact owner-scoped SQL and push ports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.handler = null;
    m.run.mockResolvedValue({ sent: 1, errors: 0 });
  });

  it("binds all three ports without launching a network worker", async () => {
    expect(startPetPreventionReminderWorker()).toBeDefined();
    expect(m.createWorker).toHaveBeenCalledWith(
      "pet-prevention-reminder",
      expect.objectContaining({ concurrency: 1 }),
    );
    expect(m.subscribe).toHaveBeenCalledTimes(2);
    expect(m.handler).not.toBeNull();
    await m.handler!({ name: "check-reminders", id: "synthetic-job" });
    expect(m.run).toHaveBeenCalledExactlyOnceWith({
      enqueue: m.enqueue,
      readDue: m.readDue,
      acknowledge: m.acknowledge,
    });
    expect(m.success).toHaveBeenCalled();
  });

  it("rejects unrelated BullMQ jobs without calling any port", async () => {
    startPetPreventionReminderWorker();
    await m.handler!({ name: "unrelated-job", id: "synthetic-unrelated" });
    expect(m.run).not.toHaveBeenCalled();
    expect(m.readDue).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.acknowledge).not.toHaveBeenCalled();
  });
});
