import { describe, expect, it, vi } from "vitest";

const { add } = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./redis.js", () => ({ connection: {} }));
vi.mock("bullmq", () => ({ Queue: class { add = add; } }));

import { enqueueFeedProcessing, enqueueFeedPhotoFollowUp, FEED_PROCESSING_QUEUE_NAME } from "./feed-processing-queue";

describe("Feed Cloud.ru immediate queue", () => {
  it.each(["photo", "video"] as const)("queues deduplicated %s trigger with retries", async kind => {
    add.mockClear();
    const uploadId = "cmvfdi1tabcd0123456789012";
    await enqueueFeedProcessing(uploadId, kind);
    await enqueueFeedProcessing(uploadId, kind);
    expect(FEED_PROCESSING_QUEUE_NAME).toBe("feed-processing-trigger");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]).toEqual([
      "process", { uploadId, kind }, {
        jobId: kind === "photo"
          ? `feed-photo-wake-${Math.floor(Date.now() / 1000)}`
          : `feed-${uploadId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    ]);
    expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
  });
  it("coalesces 100 photo upload notifications into a single per-second wake-up ID", async () => {
    add.mockClear();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
      await Promise.all(Array.from({length: 100}, (_, index) =>
        enqueueFeedProcessing("photo-" + index, "photo")));
      expect(new Set(add.mock.calls.map(call => call[2].jobId)).size).toBe(1);
      vi.setSystemTime(new Date("2026-10-20T00:00:01Z"));
      await enqueueFeedProcessing("photo-later", "photo");
      expect(new Set(add.mock.calls.map(call => call[2].jobId)).size).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("coalesces follow-up signals to one Job per five-second interval",async()=>{
    add.mockClear();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
      await enqueueFeedPhotoFollowUp(5000);
      await enqueueFeedPhotoFollowUp(5000);
      expect(add.mock.calls[0][2].jobId).toBe(add.mock.calls[1][2].jobId);
      expect(add.mock.calls[0][2].delay).toBe(5000);
      expect(add.mock.calls[0][1]).toEqual({
        uploadId:"feed-photo-resume",kind:"photo",
      });
    } finally {vi.useRealTimers();}
  });
  it("supports legacy UUID upload IDs", async () => {
    add.mockClear();
    const uploadId = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
    await enqueueFeedProcessing(uploadId, "video");
    expect(add).toHaveBeenCalledWith("process", { uploadId, kind: "video" }, expect.any(Object));
  });
  it("rejects invalid IDs and media kinds", async () => {
    add.mockClear();
    await expect(enqueueFeedProcessing("../private", "photo")).rejects.toThrow("INVALID_FEED_PROCESSING_TRIGGER");
    await expect(enqueueFeedProcessing("8dc418f6-97da-42be-ab73-b3c172c95ccd", "unknown" as "photo"))
      .rejects.toThrow("INVALID_FEED_PROCESSING_TRIGGER");
    expect(add).not.toHaveBeenCalled();
  });
});
