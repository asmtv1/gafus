import { describe, it, expect, vi, beforeEach } from "vitest";

const { processBookingSlaTimeoutMock, workerCapture } = vi.hoisted(() => ({
  processBookingSlaTimeoutMock: vi.fn(async () => {}),
  workerCapture: {
    processor: null as null | ((job: { data: { bookingId: string } }) => Promise<void>),
  },
}));

vi.mock("@gafus/core/services/consultation", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@gafus/core/services/consultation")>();
  return {
    ...mod,
    processBookingSlaTimeout: processBookingSlaTimeoutMock,
  };
});

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(
      _name: string,
      processor: (job: { data: { bookingId: string } }) => Promise<void>,
    ) {
      workerCapture.processor = processor;
    }

    on() {
      return this;
    }
  },
}));

vi.mock("@gafus/logger", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@gafus/logger")>();
  return {
    ...mod,
    createWorkerLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    }),
  };
});

vi.mock("@gafus/queues", () => ({
  connection: {},
}));

describe("consultation-sla-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerCapture.processor = null;
  });

  it("регистрирует обработчик, который вызывает processBookingSlaTimeout", async () => {
    const { startConsultationSlaWorker } = await import("./consultation-sla-worker");
    startConsultationSlaWorker();
    expect(workerCapture.processor).toBeTypeOf("function");
    await workerCapture.processor!({ data: { bookingId: "booking-1" } });
    expect(processBookingSlaTimeoutMock).toHaveBeenCalledWith("booking-1");
  }, 15_000);
});
