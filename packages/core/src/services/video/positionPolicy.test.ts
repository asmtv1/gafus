import { describe, it, expect } from "vitest";
import { MAX_VIDEO_POSITION_SECONDS, validateVideoPosition } from "./positionPolicy";
describe("pure playback position invariants", () => {
  it("rejects negatives and values beyond the policy limit", () => {
    expect(validateVideoPosition(-1)).toBe("Позиция не может быть отрицательной");
    expect(validateVideoPosition(MAX_VIDEO_POSITION_SECONDS + 1)).toContain("не должна превышать");
  });
  it("accepts boundary positions", () => {
    expect(validateVideoPosition(0)).toBeNull();
    expect(validateVideoPosition(MAX_VIDEO_POSITION_SECONDS)).toBeNull();
  });
});
