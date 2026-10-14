import { describe, expect, it, vi } from "vitest";

const { add } = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./redis.js", () => ({ connection: {} }));
vi.mock("bullmq", () => ({
  Queue: class {
    add = add;
  },
}));

import { enqueueGalleryProcessing, GALLERY_PROCESSING_QUEUE_NAME } from "./gallery-processing-queue";

describe("Gallery Cloud.ru immediate queue", () => {
  it("uses an idempotent job key and bounded retry policy", async () => {
    const uploadId = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
    await enqueueGalleryProcessing(uploadId);
    await enqueueGalleryProcessing(uploadId);
    expect(GALLERY_PROCESSING_QUEUE_NAME).toBe("gallery-processing-trigger");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]).toEqual([
      "process", { uploadId }, {
        jobId: `gallery-${uploadId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    ]);
    expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
  });
  it("rejects untrusted identifiers before queueing", async () => {
    add.mockClear();
    await expect(enqueueGalleryProcessing("../private")).rejects.toThrow("INVALID_GALLERY_UPLOAD_ID");
    expect(add).not.toHaveBeenCalled();
  });
});
