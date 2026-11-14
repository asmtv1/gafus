import { describe, expect, it } from "vitest";
import { classifyJobError, nextJobAttemptDelay, MAX_CHAT2_OUTBOX_ATTEMPTS } from "./reliable-job-policy";
describe("durable job retry classification", () => {
  it("never stores raw upstream errors or secrets", () => {
    expect(classifyJobError(new Error("Bearer SecretFromProvider"))).toEqual({
      code: "CHAT2_OUTBOX_DISPATCH_FAILED", retryable: true,
    });
  });
  it("stops invalid/fail-closed config while retrying temporary transport errors", () => {
    expect(classifyJobError(Error("CHAT2_UNSAFE_REALTIME_ENDPOINT")).retryable).toBe(false);
    expect(classifyJobError(Error("CHAT2_CENTRIFUGO_PUBLISH_FAILED")).retryable).toBe(true);
  });
  it("bounded jitter with finite attempts", () => {
    expect(nextJobAttemptDelay(1, () => 0)).toBe(500);
    expect(nextJobAttemptDelay(1, () => 1)).toBe(1000);
    expect(nextJobAttemptDelay(100, () => 1)).toBe(60_000);
    expect(MAX_CHAT2_OUTBOX_ATTEMPTS).toBe(8);
  });
});
