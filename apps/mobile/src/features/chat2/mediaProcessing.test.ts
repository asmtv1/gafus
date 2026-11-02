import { afterEach, describe, expect, it, vi } from "vitest";
import { isChat2MediaProcessing, readProcessedChat2Media } from "./mediaProcessing";

afterEach(() => vi.useRealTimers());
describe("Chat2 processing only after message commit", () => {
  it("recognizes pre-ready status and no signed URL", () => {
    for (const status of ["UPLOADED", "QUEUED", "PROCESSING"]) {
      expect(isChat2MediaProcessing({ url: "", status })).toBe(true);
    }
    expect(isChat2MediaProcessing({ url: "https://cdn.example/image.webp" })).toBe(false);
    expect(isChat2MediaProcessing({ url: "", status: "FAILED" })).toBe(false);
  });

  it("waits until READY and never exposes an unprocessed URL", async () => {
    vi.useFakeTimers();
    const responses = [
      { url: "", status: "UPLOADED" },
      { url: "", status: "QUEUED" },
      { url: "", status: "PROCESSING" },
      { url: "https://s3.example/v1/image.webp", status: "READY" },
    ];
    const read = vi.fn(async () => responses.shift()!);
    const processing = vi.fn();
    const result = readProcessedChat2Media(read, new AbortController().signal, processing, 50);
    await vi.advanceTimersByTimeAsync(150);
    await expect(result).resolves.toEqual({
      url: "https://s3.example/v1/image.webp", status: "READY",
    });
    expect(read).toHaveBeenCalledTimes(4);
    expect(processing).toHaveBeenCalledTimes(3);
  });

  it("rejects FAILED state and missing URL without revealing a placeholder key", async () => {
    await expect(readProcessedChat2Media(async () => ({ url: "", status: "FAILED" }),
      new AbortController().signal)).rejects.toThrow("CHAT2_MEDIA_NOT_READY");
    await expect(readProcessedChat2Media(async () => ({ url: "" }),
      new AbortController().signal)).rejects.toThrow("CHAT2_MEDIA_NOT_READY");
  });

  it("aborts pending polling when room or actor unmounts", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const read = vi.fn(async () => ({ url: "", status: "PROCESSING" }));
    const result = readProcessedChat2Media(read, ctrl.signal);
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    await expect(result).rejects.toThrow("CHAT2_MEDIA_READ_CANCELLED");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("times out with a visible retry rather than polling indefinitely", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => ({ url: "", status: "PROCESSING" }));
    const result = readProcessedChat2Media(read, new AbortController().signal, undefined, 100, 2);
    const rejection = expect(result).rejects.toThrow("CHAT2_MEDIA_PROCESSING_TIMEOUT");
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(read).toHaveBeenCalledTimes(2);
  });
});
