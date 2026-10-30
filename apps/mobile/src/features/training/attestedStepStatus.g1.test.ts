import { describe, it, expect } from "vitest";
import { maskUnattestedCompletedStep } from "./attestedStepStatus";
import type { LocalStepState } from "@/shared/stores/stepStore";
const stale: LocalStepState = {
  status: "COMPLETED",
  remainingSec: null,
  timeLeft: 0,
  updatedAt: 1,
};
describe("AccordionStep Phase1 verified completion UI", () => {
  it("masks an ownerless persisted completed status after restart without exact v2 receipt", () => {
    expect(maskUnattestedCompletedStep(stale, false, false)).toBeNull();
  });
  it("allows exact owner+epoch v2 readback or server-verified completion", () => {
    expect(maskUnattestedCompletedStep(stale, true, false)).toBe(stale);
    expect(maskUnattestedCompletedStep(stale, false, true)).toBe(stale);
  });
  it("does not infer completion from unrelated in-progress status or a failed storage read", () => {
    const running: LocalStepState = { ...stale, status: "IN_PROGRESS" };
    expect(maskUnattestedCompletedStep(running, false, false)).toBe(running);
    expect(maskUnattestedCompletedStep(stale, false, false)).toBeNull();
  });
});
