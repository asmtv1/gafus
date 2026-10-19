import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  worker: vi.fn(),
  photoDispatch: vi.fn().mockResolvedValue({ dispatched: 1 }),
  videoDispatch: vi.fn().mockResolvedValue({ dispatched: 1 }),
  createDispatcher: vi.fn(),
  processor: undefined as undefined | ((job: { data: { uploadId: string; kind: string } }) => Promise<void>),
}));
vi.mock("@gafus/queues", () => ({
  connection: {}, FEED_PROCESSING_QUEUE_NAME: "feed-processing-trigger",
  isFeedUploadId: (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value),
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("./cloudru-media-dispatcher", () => ({
  createCloudruFeedPoolDispatcher: (...args: unknown[]) => {
    mocks.createDispatcher(...args);
    return args[0] === "photo" ? mocks.photoDispatch : mocks.videoDispatch;
  },
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(name: string, processor: typeof mocks.processor, options: unknown) {
      mocks.worker(name, options);
      mocks.processor = processor;
    }
    on() { return this; }
  },
}));

const uploadId = "cmvfdi1tabcd0123456789012";
describe("Feed immediate trigger worker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.processor = undefined;
  });

  it("does not start without the media release or readiness", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "false");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    expect(mocks.worker).not.toHaveBeenCalled();
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "false");
    startFeedProcessingTriggerWorker();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("ignores unsafe Cloud.ru configuration without stopping the main Worker", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    mocks.createDispatcher.mockImplementationOnce(() => { throw new Error("invalid settings"); });
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    expect(() => startFeedProcessingTriggerWorker()).not.toThrow();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("routes each media kind to its own Cloud.ru job with rate limiting", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    expect(mocks.createDispatcher.mock.calls.map(call => call[0])).toEqual(["photo", "video"]);
    expect(mocks.worker).toHaveBeenCalledWith("feed-processing-trigger", expect.objectContaining({
      concurrency: 1, limiter: { max: 1, duration: 500 },
    }));
    await mocks.processor!({ data: { uploadId, kind: "photo" } });
    expect(mocks.photoDispatch).toHaveBeenCalledOnce();
    expect(mocks.videoDispatch).not.toHaveBeenCalled();
    await mocks.processor!({ data: { uploadId, kind: "video" } });
    expect(mocks.videoDispatch).toHaveBeenCalledOnce();
    expect(mocks.photoDispatch).toHaveBeenCalledOnce();
  });

  it("accepts legacy UUID jobs as well as Prisma CUIDs", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    await mocks.processor!({
      data: { uploadId: "8dc418f6-97da-42be-ab73-b3c172c95ccd", kind: "video" },
    });
    expect(mocks.videoDispatch).toHaveBeenCalledOnce();
  });

  it("rejects untrusted kinds/IDs and retries unaccepted Cloud.ru launches", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    await expect(mocks.processor!({ data: { uploadId: "../private", kind: "photo" } }))
      .rejects.toThrow("INVALID_FEED_UPLOAD_ID");
    await expect(mocks.processor!({ data: { uploadId, kind: "other" } }))
      .rejects.toThrow("INVALID_FEED_PROCESSING_KIND");
    expect(mocks.photoDispatch).not.toHaveBeenCalled();
    mocks.videoDispatch.mockResolvedValueOnce({ dispatched: 0 });
    await expect(mocks.processor!({ data: { uploadId, kind: "video" } }))
      .rejects.toThrow("FEED_PROCESS_TRIGGER_NOT_DISPATCHED");
  });
});
