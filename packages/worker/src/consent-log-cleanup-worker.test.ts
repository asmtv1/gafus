import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteOldFailedConsentLogs = vi.fn();

vi.mock("@gafus/core", () => ({
  deleteOldFailedConsentLogs: (...args: unknown[]) =>
    mockDeleteOldFailedConsentLogs(...args),
}));
vi.mock("@gafus/queues", () => ({ connection: {} }));
vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    on = vi.fn();
    close = vi.fn();
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

describe("consent-log-cleanup-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteOldFailedConsentLogs.mockResolvedValue({ deleted: 3 });
  });

  describe("startConsentLogCleanupWorker", () => {
    it("возвращает worker с методом start", async () => {
      const { startConsentLogCleanupWorker } = await import(
        "./consent-log-cleanup-worker"
      );
      const worker = startConsentLogCleanupWorker();
      expect(worker).toBeDefined();
      expect(worker.start).toBeDefined();
    });
  });
});
