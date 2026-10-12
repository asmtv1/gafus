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

vi.mock("./cynologist-chat-worker", () => ({
  startCynologistChatWorker: async () => {
    observedMaxListeners.push(process.getMaxListeners());
  },
}));

vi.mock("./push-worker", () => recordBootstrapModule());
vi.mock("./reengagement-worker", () => recordBootstrapModule());
vi.mock("./video-transcoding-worker", () => recordBootstrapModule());

vi.mock("./consent-log-cleanup-worker", () => ({
  startConsentLogCleanupWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("consent-log-cleanup");
  },
}));

vi.mock("./exam-cleanup-worker", () => ({
  startExamCleanupWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("exam-cleanup");
  },
}));

vi.mock("./pet-prevention-reminder-worker", () => ({
  startPetPreventionReminderWorker: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("pet-prevention-reminder");
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

vi.mock("./cron-scheduler", () => ({
  startCronJobs: () => {
    observedMaxListeners.push(process.getMaxListeners());
    startCalls.push("cron");
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

    const { workerBootstrapReady } = await import("./index");
    await workerBootstrapReady;

    expect(observedMaxListeners.length).toBeGreaterThan(0);
    expect(Math.min(...observedMaxListeners)).toBeGreaterThanOrEqual(64);
    expect(startCalls).toEqual([
      "exam-cleanup",
      "consent-log-cleanup",
      "pet-prevention-reminder",
      "consultation-sla",
      "consultation-mail",
      "consultation-reminder",
      "cron",
    ]);
  });
});
