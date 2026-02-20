import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRepeatableJobs = vi.fn();
const mockRemoveRepeatableByKey = vi.fn();
const mockAdd = vi.fn();

vi.mock("@gafus/queues", () => ({
  consentLogCleanupQueue: {
    getRepeatableJobs: () => mockGetRepeatableJobs(),
    removeRepeatableByKey: (key: string) => mockRemoveRepeatableByKey(key),
    add: (...args: unknown[]) => mockAdd(...args),
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

describe("consent-log-cleanup-schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepeatableJobs.mockResolvedValue([]);
    mockAdd.mockResolvedValue({});
  });

  describe("setupConsentLogCleanupSchedule", () => {
    it("добавляет повторяемую задачу и initial cleanup с правильным cron", async () => {
      const { setupConsentLogCleanupSchedule } = await import(
        "./consent-log-cleanup-schedule"
      );

      await setupConsentLogCleanupSchedule();

      expect(mockAdd).toHaveBeenCalledWith(
        "daily-cleanup",
        {},
        expect.objectContaining({
          repeat: { pattern: "0 2 * * *", tz: "Europe/Moscow" },
          attempts: 1,
        }),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "initial-cleanup",
        {},
        expect.objectContaining({ delay: 60000 }),
      );
    });

    it("удаляет старое расписание при наличии", async () => {
      mockGetRepeatableJobs.mockResolvedValue([{ key: "old-key" }]);
      const { setupConsentLogCleanupSchedule } = await import(
        "./consent-log-cleanup-schedule"
      );

      await setupConsentLogCleanupSchedule();

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("old-key");
    });
  });
});
