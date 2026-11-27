import { afterEach, describe, expect, it, vi } from "vitest";

const { observedMaxListeners, startCalls } = vi.hoisted(() => ({
  observedMaxListeners: [] as number[],
  startCalls: [] as string[],
}));

const recordBootstrapModule = () => {
  observedMaxListeners.push(process.getMaxListeners());
  return {};
};

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("./health-server", () => ({
  startHealthServer: vi.fn(),
}));

vi.mock("./push-worker", () => ({ ...recordBootstrapModule(), startPushWorker: () => () => {} }));
vi.mock("./reengagement-worker", () => ({ ...recordBootstrapModule(), startReengagementWorker: () => () => {} }));
vi.mock("./video-transcoding-worker", () => ({ ...recordBootstrapModule(), startVideoTranscodingWorker: () => () => {} }));

vi.mock("./consent-log-cleanup-worker", () => ({
  startConsentLogCleanupWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("consent-log-cleanup");
    return { close: async () => {} };
  },
}));

vi.mock("./exam-cleanup-worker", () => ({
  startExamCleanupWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("exam-cleanup");
    return { close: async () => {} };
  },
}));

vi.mock("./pet-prevention-reminder-worker", () => ({
  startPetPreventionReminderWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("pet-prevention-reminder");
    return { close: async () => {} };
  },
}));

vi.mock("./consultation-mail-worker", () => ({
  startConsultationMailWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("consultation-mail");
  },
}));

vi.mock("./consultation-reminder-worker", () => ({
  startConsultationReminderWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("consultation-reminder");
  },
}));

vi.mock("./consultation-sla-worker", () => ({
  startConsultationSlaWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("consultation-sla");
  },
}));

vi.mock("./schedules/consent-log-cleanup-schedule", () => ({
  setupConsentLogCleanupSchedule: vi.fn(async () => {}),
}));

vi.mock("./schedules/exam-cleanup-schedule", () => ({
  setupExamCleanupSchedule: vi.fn(async () => {}),
}));

vi.mock("./schedules/pet-prevention-reminder-schedule", () => ({
  setupPetPreventionReminderSchedule: vi.fn(async () => {}),
}));

vi.mock("./feed-processing-trigger-worker", () => ({
  startFeedProcessingTriggerWorker: () => {
    startCalls.push("feed-processing-trigger");
  },
}));

vi.mock("./chat2-outbox-worker", () => ({ startChat2OutboxWorker: () => () => {} }));
vi.mock("./chat2-media-processing-trigger-worker", () => ({ startChat2MediaProcessingTriggerWorker: vi.fn() }));
vi.mock("./mobile-telemetry-spool-worker", () => ({ startMobileTelemetryExportWorker: vi.fn(), stopMobileTelemetryExportWorker: vi.fn() }));
vi.mock("./cron-scheduler", () => ({
  startCronJobs: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("cron");
    return () => {};
  },
}));

describe("worker bootstrap", () => {
  afterEach(() => {
    vi.resetModules();
    observedMaxListeners.length = 0;
    startCalls.length = 0;
    process.setMaxListeners(10);
  });

  it("configures process listener limit before worker modules initialize", async () => {
    process.setMaxListeners(10);

    const { createWorkerRuntime } = await import("./index");
    expect(startCalls).toEqual([]);
    const runtime = createWorkerRuntime();
    await runtime.start();
    await runtime.start();

    expect(observedMaxListeners.length).toBeGreaterThan(0);
    expect(Math.min(...observedMaxListeners)).toBeGreaterThanOrEqual(64);
    expect(startCalls).toEqual([
      "exam-cleanup",
      "consent-log-cleanup",
      "pet-prevention-reminder",
      "consultation-sla",
      "consultation-mail",
      "consultation-reminder",
      "feed-processing-trigger",
      "cron",
    ]);
    await runtime.stop();
    await runtime.stop();
    await expect(runtime.start()).rejects.toThrow("WORKER_RUNTIME_STOPPED");
    startCalls.length = 0;
    const next = createWorkerRuntime();
    await next.start();
    expect(startCalls).toHaveLength(8);
    await next.stop();
  });
});
