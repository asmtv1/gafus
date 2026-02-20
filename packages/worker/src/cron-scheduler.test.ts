import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSchedule = vi.fn();

vi.mock("node-cron", () => ({
  default: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
  },
}));

vi.mock("@gafus/logger", () => ({
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

vi.mock("./training-reminders-sender", () => ({
  sendTrainingReminders: vi.fn().mockResolvedValue({ sent: 0, skipped: 0, errors: 0 }),
}));

describe("cron-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCronJobs", () => {
    it("регистрирует 3 cron задачи", async () => {
      const { startCronJobs } = await import("./cron-scheduler");

      startCronJobs();

      expect(mockSchedule).toHaveBeenCalledTimes(3);
    });
  });
});
