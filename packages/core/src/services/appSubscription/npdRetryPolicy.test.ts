import { describe, expect, it } from "vitest";
import {
  getNextNpdReceiptRetryAt,
  isNpdReceiptErrorRetryable,
  NPD_RECEIPT_RETRY_DELAYS_MS,
} from "./npdRetryPolicy";

describe("NPD retry policy in core", () => {
  const now = new Date("2026-10-11T10:00:00Z");

  it("retries only temporary provider/network errors", () => {
    for (const code of ["RATE_LIMITED", "TIMEOUT", "NETWORK"]) {
      expect(isNpdReceiptErrorRetryable(code)).toBe(true);
    }
    for (const code of ["INVALID_RECEIPT", "PERMANENT", "AUTH_REQUIRED"]) {
      expect(isNpdReceiptErrorRetryable(code)).toBe(false);
    }
  });

  it("uses deterministic increasing bounded delay", () => {
    const a = getNextNpdReceiptRetryAt(1, now);
    const b = getNextNpdReceiptRetryAt(1, now);
    expect(a).toEqual(b);
    expect(a.getTime()).toBeGreaterThan(now.getTime());
    expect(getNextNpdReceiptRetryAt(3, now).getTime()).toBeGreaterThan(a.getTime());
    expect(getNextNpdReceiptRetryAt(10, now).getTime() - now.getTime())
      .toBeLessThanOrEqual(NPD_RECEIPT_RETRY_DELAYS_MS.at(-1)! * 1.1);
  });
});
