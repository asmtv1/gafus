import { describe, expect, it, vi } from "vitest";

const { add } = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./redis.js", () => ({ connection: {} }));
vi.mock("bullmq", () => ({ Queue: class { add = add; } }));

import { enqueueFeedProcessing, FEED_PROCESSING_QUEUE_NAME } from "./feed-processing-queue";

describe("Feed Cloud.ru immediate queue", () => {
  it.each(["photo", "video"] as const)("queues deduplicated %s trigger with retries", async kind => {
    add.mockClear();
    const uploadId = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
    await enqueueFeedProcessing(uploadId, kind);
    await enqueueFeedProcessing(uploadId, kind);
    expect(FEED_PROCESSING_QUEUE_NAME).toBe("feed-processing-trigger");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]).toEqual([
      "process", { uploadId, kind }, {
        jobId: `feed-${uploadId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    ]);
    expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
  });
  it("rejects invalid IDs and media kinds", async () => {
    add.mockClear();
    await expect(enqueueFeedProcessing("../private", "photo")).rejects.toThrow("INVALID_FEED_PROCESSING_TRIGGER");
    await expect(enqueueFeedProcessing("8dc418f6-97da-42be-ab73-b3c172c95ccd", "unknown" as "photo"))
      .rejects.toThrow("INVALID_FEED_PROCESSING_TRIGGER");
    expect(add).not.toHaveBeenCalled();
  });
});
