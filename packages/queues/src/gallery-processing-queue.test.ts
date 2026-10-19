import { describe, expect, it, vi } from "vitest";

const { add } = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./redis.js", () => ({ connection: {} }));
vi.mock("bullmq", () => ({
  Queue: class {
    add = add;
  },
}));

import { enqueueGalleryProcessing, enqueueGalleryFollowUp, isGalleryUploadId, GALLERY_PROCESSING_QUEUE_NAME } from "./gallery-processing-queue";

describe("Gallery Cloud.ru immediate queue", () => {
  it("uses an idempotent job key and bounded retry policy", async () => {
    const uploadId = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
    await enqueueGalleryProcessing(uploadId);
    await enqueueGalleryProcessing(uploadId);
    expect(GALLERY_PROCESSING_QUEUE_NAME).toBe("gallery-processing-trigger");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]).toEqual([
      "process", { uploadId }, {
        jobId: `gallery-wake-${Math.floor(Date.now() / 1000)}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    ]);
    expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
  });
  it("accepts GalleryUpload Prisma CUID, historical UUID and the full Core ID charset", async () => {
    for (const valid of [
      "cmk9c97x50000kux3gu1gh6xd",
      "clzz2y2be0000vh7vujhe2k0b",
      "8dc418f6-97da-42be-ab73-b3c172c95ccd",
      "CUID_with-letters_123",
    ]) {
      expect(isGalleryUploadId(valid)).toBe(true);
      await expect(enqueueGalleryProcessing(valid)).resolves.toBeUndefined();
    }
    for (const invalid of ["", "../private", "hello/world", "a:b", "a b", "x".repeat(129), null]) {
      expect(isGalleryUploadId(invalid)).toBe(false);
    }
  });
  it("coalesces 100 upload wakes to a single per-second ID",async()=>{
    add.mockClear();
    vi.useFakeTimers();
    try{
      vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
      await Promise.all(Array.from({length:100},(_,i)=>
        enqueueGalleryProcessing("8dc418f6-97da-42be-ab73-"+String(i).padStart(12,"0"))));
      expect(new Set(add.mock.calls.map(call=>call[2].jobId)).size).toBe(1);
    }finally{vi.useRealTimers();}
  });
  it("coalesces delayed follow-ups into one five-second key",async()=>{
    add.mockClear();
    vi.useFakeTimers();
    try{
      vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
      await enqueueGalleryFollowUp(5000);
      await enqueueGalleryFollowUp(5000);
      expect(add.mock.calls[0][2].jobId).toBe(add.mock.calls[1][2].jobId);
      expect(add.mock.calls[0][2].delay).toBe(5000);
      expect(add.mock.calls[0][1]).toEqual({uploadId:"gallery-follow-up"});
    }finally{vi.useRealTimers();}
  });
  it("rejects untrusted identifiers before queueing", async () => {
    add.mockClear();
    await expect(enqueueGalleryProcessing("../private")).rejects.toThrow("INVALID_GALLERY_UPLOAD_ID");
    expect(add).not.toHaveBeenCalled();
  });
});
