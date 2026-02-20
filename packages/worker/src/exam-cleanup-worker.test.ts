import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    examResult: {
      findMany: () => mockFindMany(),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@gafus/queues", () => ({
  connection: {},
}));

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
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: vi.fn().mockResolvedValue(undefined),
}));

describe("exam-cleanup-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  describe("startExamCleanupWorker", () => {
    it("возвращает worker и вызывает start", async () => {
      const { startExamCleanupWorker } = await import("./exam-cleanup-worker");
      const worker = startExamCleanupWorker();
      expect(worker).toBeDefined();
      expect(worker.start).toBeDefined();
    });
  });
});
