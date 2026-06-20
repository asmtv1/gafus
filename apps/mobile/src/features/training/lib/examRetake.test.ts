import { describe, expect, it } from "vitest";

import { canRetakeRejectedExam } from "./examRetake";

describe("canRetakeRejectedExam", () => {
  it("allows retake after trainer rejection or automatic test failure", () => {
    expect(canRetakeRejectedExam({ reviewedAt: "2026-06-07T10:00:00.000Z", isPassed: false })).toBe(
      true,
    );
    expect(canRetakeRejectedExam({ reviewedAt: "2026-06-07T10:00:00.000Z", isPassed: true })).toBe(
      false,
    );
    expect(canRetakeRejectedExam({ reviewedAt: null, isPassed: false })).toBe(true);
    expect(canRetakeRejectedExam(null)).toBe(false);
  });
});
