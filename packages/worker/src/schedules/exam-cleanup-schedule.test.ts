import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRepeatableJobs = vi.fn();
const mockRemoveRepeatableByKey = vi.fn();
const mockAdd = vi.fn();

vi.mock("@gafus/queues", () => ({
  examCleanupQueue: {
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

describe("exam-cleanup-schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepeatableJobs.mockResolvedValue([]);
    mockAdd.mockResolvedValue({});
  });

  describe("setupExamCleanupSchedule", () => {
    it("добавляет повторяемую задачу и initial cleanup", async () => {
      const { setupExamCleanupSchedule } = await import("./exam-cleanup-schedule");

      await setupExamCleanupSchedule();

      expect(mockAdd).toHaveBeenCalledWith(
        "daily-cleanup",
        {},
        expect.objectContaining({
          repeat: { pattern: "0 3 * * *", tz: "Europe/Moscow" },
        }),
      );
      expect(mockAdd).toHaveBeenCalledWith("initial-cleanup", {}, expect.any(Object));
    });

    it("удаляет старое расписание при наличии", async () => {
      mockGetRepeatableJobs.mockResolvedValue([{ key: "old-key" }]);
      const { setupExamCleanupSchedule } = await import("./exam-cleanup-schedule");

      await setupExamCleanupSchedule();

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("old-key");
    });
  });
});
