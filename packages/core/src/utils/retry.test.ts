import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { retryWithBackoff, retryServerAction } from "./retry";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns value on first success, calls fn once", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const p = retryWithBackoff(fn);
    const result = await p;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure then succeeds on second try", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const p = retryWithBackoff(fn, { maxRetries: 2, baseDelay: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws last error when all retries exhausted", async () => {
    const err = new Error("persistent");
    const fn = vi.fn().mockRejectedValue(err);
    const p = retryWithBackoff(fn, { maxRetries: 3, baseDelay: 100 });
    const caught = p.catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await caught;
    expect(result).toBe(err);
    expect(result.message).toBe("persistent");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry callback on each retry", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValue("ok");
    const p = retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelay: 100,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it("respects custom maxRetries and baseDelay", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const p = retryWithBackoff(fn, { maxRetries: 2, baseDelay: 500 });
    await vi.advanceTimersByTimeAsync(500);
    const result = await p;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caps delay at maxDelay", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");
    const p = retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 1500,
    });
    await vi.advanceTimersByTimeAsync(1000 + 1500);
    const result = await p;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("retryServerAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves on success", async () => {
    const action = vi.fn().mockResolvedValue("done");
    const p = retryServerAction(action, "myAction");
    const result = await p;
    expect(result).toBe("done");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("retries and resolves on second try", async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("done");
    const p = retryServerAction(action, "myAction", {
      maxRetries: 2,
      baseDelay: 100,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result).toBe("done");
    expect(action).toHaveBeenCalledTimes(2);
  });
});
