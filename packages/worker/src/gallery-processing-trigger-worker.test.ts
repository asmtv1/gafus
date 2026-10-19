import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  worker: vi.fn(),
  execute: vi.fn().mockResolvedValue({ dispatched: 1 }),
  createDispatcher: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  processor: undefined as undefined | ((job: { data: { uploadId: string } }) => Promise<void>),
}));

vi.mock("@gafus/queues", () => ({
  connection: {},
  GALLERY_PROCESSING_QUEUE_NAME: "gallery-processing-trigger",
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("./gallery-demand", () => ({
  createGalleryDemandDispatcher: (...args: unknown[]) => {
    mocks.createDispatcher(...args);
    return mocks.execute;
  },
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(name: string, processor: typeof mocks.processor, options: unknown) {
      mocks.worker(name, options);
      mocks.processor = processor;
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      mocks.handlers[event] = handler;
      return this;
    }
  },
}));

describe("gallery immediate trigger worker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.processor = undefined;
  });

  it("does not start when Cloud.ru processing is disabled", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "false");
    const { startGalleryProcessingTriggerWorker } = await import("./gallery-processing-trigger-worker");
    startGalleryProcessingTriggerWorker();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("keeps other workers alive when the gallery dispatcher rejects configuration", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("GALLERY_PROCESSOR_READY", "true");
    mocks.createDispatcher.mockImplementationOnce(() => { throw new Error("config missing"); });
    const { startGalleryProcessingTriggerWorker } = await import("./gallery-processing-trigger-worker");
    expect(() => startGalleryProcessingTriggerWorker()).not.toThrow();
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("launches only Gallery with a bounded concurrency and checks the upload ID", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("GALLERY_PROCESSOR_READY", "true");
    const { startGalleryProcessingTriggerWorker } = await import("./gallery-processing-trigger-worker");
    startGalleryProcessingTriggerWorker();
    expect(mocks.createDispatcher).toHaveBeenCalledOnce();
    expect(mocks.worker).toHaveBeenCalledWith("gallery-processing-trigger", expect.objectContaining({
      concurrency: 1, limiter: { max: 1, duration: 1500 },
    }));
    const processor = mocks.processor!;
    await processor({ data: { uploadId: "8dc418f6-97da-42be-ab73-b3c172c95ccd" } });
    expect(mocks.execute).toHaveBeenCalledOnce();
    await expect(processor({ data: { uploadId: "../../other" } })).rejects.toThrow("INVALID_GALLERY_UPLOAD_ID");
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("accepts coalesced, idle, capacity-blocked, and batch wake results",async()=>{
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");
    vi.stubEnv("GALLERY_PROCESSOR_READY","true");
    const {startGalleryProcessingTriggerWorker}=await import("./gallery-processing-trigger-worker");
    startGalleryProcessingTriggerWorker();
    for(const result of [
      {dispatched:0,coalesced:true},{dispatched:0,idle:true},
      {dispatched:0,blocked:true},{dispatched:10},
    ]){
      mocks.execute.mockResolvedValueOnce(result);
      await expect(mocks.processor!({data:{uploadId:"gallery-follow-up"}}))
        .resolves.toBeUndefined();
    }
  });
  it("fails job for retry when provider has not accepted execution", async () => {
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED", "true");
    vi.stubEnv("GALLERY_PROCESSOR_READY", "true");
    mocks.execute.mockResolvedValueOnce({ dispatched: 0 });
    const { startGalleryProcessingTriggerWorker } = await import("./gallery-processing-trigger-worker");
    startGalleryProcessingTriggerWorker();
    await expect(mocks.processor!({ data: { uploadId: "8dc418f6-97da-42be-ab73-b3c172c95ccd" } }))
      .rejects.toThrow("GALLERY_PROCESS_TRIGGER_NOT_DISPATCHED");
  });
});
