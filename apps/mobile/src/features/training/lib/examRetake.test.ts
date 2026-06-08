import { describe, expect, it } from "vitest";

import { canRetakeRejectedExam } from "./examRetake";

describe("canRetakeRejectedExam", () => {
  it("allows retake only after trainer rejected a reviewed exam", () => {
    expect(canRetakeRejectedExam({ reviewedAt: "2026-06-07T10:00:00.000Z", isPassed: false })).toBe(
      true,
    );
    expect(canRetakeRejectedExam({ reviewedAt: "2026-06-07T10:00:00.000Z", isPassed: true })).toBe(
      false,
    );
    expect(canRetakeRejectedExam({ reviewedAt: null, isPassed: false })).toBe(false);
    expect(canRetakeRejectedExam(null)).toBe(false);
  });
});
