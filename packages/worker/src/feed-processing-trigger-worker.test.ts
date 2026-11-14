import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  worker: vi.fn(),
  photoDispatch: vi.fn().mockResolvedValue({ dispatched: 1 }),
  videoDispatch: vi.fn().mockResolvedValue({ dispatched: 1 }),
  createDispatcher: vi.fn(),
  processor: undefined as undefined | ((job: { data: { uploadId: string; kind: string } }) => Promise<void>),
}));
vi.mock("@gafus/queues", () => ({ connection: {}, FEED_PROCESSING_QUEUE_NAME: "feed-processing-trigger" }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("./cloudru-media-dispatcher", () => ({
  safeCloudruDispatchError: (error: unknown) => error instanceof Error ? error : Error("CLOUDRU_JOB_UNKNOWN_FAILURE"),
  createCloudruFeedPoolDispatcher: (...args: unknown[]) => {
    mocks.createDispatcher(...args);
    return args[0] === "photo" ? mocks.photoDispatch : mocks.videoDispatch;
  },
}));
vi.mock("bullmq", () => ({
  UnrecoverableError: class UnrecoverableError extends Error { name = "UnrecoverableError"; },
  Worker: class {
    constructor(name: string, processor: typeof mocks.processor, options: unknown) {
      mocks.worker(name, options);
      mocks.processor = processor;
    }
    on() { return this; }
  },
}));

const uploadId = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
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

  it("runs only video Cloud Jobs and refuses retired photo wake-ups", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    expect(mocks.createDispatcher.mock.calls.map(call => call[0])).toEqual(["video"]);
    expect(mocks.worker).toHaveBeenCalledWith("feed-processing-trigger", expect.objectContaining({
      concurrency: 1, limiter: { max: 1, duration: 500 },
    }));
    await expect(mocks.processor!({ data: { uploadId, kind: "photo" } }))
      .rejects.toThrow("RETIRED_FEED_PHOTO_JOB");
    expect(mocks.photoDispatch).not.toHaveBeenCalled();
    expect(mocks.videoDispatch).not.toHaveBeenCalled();
    await mocks.processor!({ data: { uploadId, kind: "video" } });
    expect(mocks.videoDispatch).toHaveBeenCalledOnce();
    expect(mocks.photoDispatch).not.toHaveBeenCalled();
  });

  it("rejects untrusted kinds/IDs and retries unaccepted Cloud.ru launches", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    await expect(mocks.processor!({ data: { uploadId: "../private", kind: "photo" } }))
      .rejects.toThrow("INVALID_FEED_UPLOAD_ID");
    await expect(mocks.processor!({ data: { uploadId, kind: "other" } }))
      .rejects.toThrow("RETIRED_FEED_PHOTO_JOB");
    expect(mocks.photoDispatch).not.toHaveBeenCalled();
    mocks.videoDispatch.mockResolvedValueOnce({ dispatched: 0 });
    await expect(mocks.processor!({ data: { uploadId, kind: "video" } }))
      .rejects.toThrow("FEED_PROCESS_TRIGGER_NOT_DISPATCHED");
  });
 it("does not ask BullMQ to retry an uncertain Cloud.ru :execute POST",async()=>{
  vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");
  vi.stubEnv("FEED_PROCESSOR_READY","true");
  const {startFeedProcessingTriggerWorker}=await import("./feed-processing-trigger-worker");
  startFeedProcessingTriggerWorker();
  mocks.videoDispatch.mockRejectedValueOnce(Error("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_503"));
  const failure=await mocks.processor!({data:{uploadId,kind:"video"}}).catch(error=>error);
  expect(failure.name).toBe("UnrecoverableError");
  expect(failure.message).toBe("CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN");
  expect(mocks.videoDispatch).toHaveBeenCalledOnce();
  mocks.videoDispatch.mockRejectedValueOnce(Error("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_429"));
  await expect(mocks.processor!({data:{uploadId,kind:"video"}}))
    .rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_429");
 });

});

describe("Feed Cloud.ru immediate wake fencing", () => {
  it("never retries malformed upload IDs and retired photo wakes", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    for (const item of [{ uploadId: "not-a-uuid", kind: "video" }, { uploadId, kind: "photo" }]) {
      const failure = await mocks.processor!({ data: item }).catch((error: Error) => error);
      expect((failure as Error).name).toBe("UnrecoverableError");
    }
    expect(mocks.videoDispatch).not.toHaveBeenCalled();
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.processor = undefined; });
  it.each([
    ["CLOUDRU_JOB_EXECUTION_NETWORK_TIMEOUT", "CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN"],
    ["CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_503", "CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN"],
    ["CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_403", "CLOUDRU_JOB_EXECUTION_PERMANENT_REJECTION"],
  ])("stops duplicate physical dispatch for %s", async (providerError, expected) => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    mocks.videoDispatch.mockRejectedValueOnce(new Error(providerError));
    await expect(mocks.processor!({ data: { uploadId, kind: "video" } }))
      .rejects.toThrow(expected);
    expect(mocks.videoDispatch).toHaveBeenCalledOnce();
  });
  it("allows a known 429 rejection to be retried by BullMQ", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("FEED_PROCESSOR_READY", "true");
    const { startFeedProcessingTriggerWorker } = await import("./feed-processing-trigger-worker");
    startFeedProcessingTriggerWorker();
    mocks.videoDispatch.mockRejectedValueOnce(Error("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_429"));
    await expect(mocks.processor!({ data: { uploadId, kind: "video" } }))
      .rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_429");
    await expect(mocks.processor!({ data: { uploadId, kind: "video" } })).resolves.toBeUndefined();
    expect(mocks.videoDispatch).toHaveBeenCalledTimes(2);
  });
});
