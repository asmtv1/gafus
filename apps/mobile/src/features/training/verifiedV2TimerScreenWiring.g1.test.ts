/** Source guard for both ACTUAL route → AccordionStep → mounted verified v2 restore. */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
const ordinary = readFileSync(
  new URL("../../../app/(main)/training/[courseType]/[dayId].tsx", import.meta.url),
  "utf8",
);
const daily = readFileSync(
  new URL("../../../app/(main)/daily-course/[scheduleId].tsx", import.meta.url),
  "utf8",
);
const accordion = readFileSync(new URL("./components/AccordionStep.tsx", import.meta.url), "utf8");
const restore = readFileSync(
  new URL("./useVerifiedV2StepTimerRestore.ts", import.meta.url),
  "utf8",
);
describe("OFF021 two actual mobile training screens verified completion/timer route", () => {
  it("both screens route exact owner-scoped COMPLETED occurrences to the shared Accordion step", () => {
    expect(ordinary).toContain("<AccordionStep");
    expect(ordinary).toContain("verifiedLocalCompleted={");
    expect(ordinary).toContain("onlineReceipt.isConfirmed(index) ||");
    expect(ordinary).toContain("visiblePendingTimers.some(");
    expect(ordinary).toContain('row.status === "COMPLETED"');
    expect(ordinary).toContain("void refreshPendingTimers();");
    expect(daily).toContain("<AccordionStep");
    expect(daily).toContain("verifiedLocalCompleted={");
    expect(daily).toContain("onlineReceipt.isConfirmed(index) ||");
    expect(daily).toContain("pendingDaily.some(");
    expect(daily).toContain('row.status === "COMPLETED"');
    expect(ordinary).toContain("dayOnCourseId={dayId}");
    expect(daily).toContain("dayOnCourseId={normalizedScheduleId}");
  });
  it("Accordion masks unverified ownerless completed state and restores through existing v2 reducer", () => {
    expect(accordion).toContain("maskUnattestedCompletedStep(");
    expect(accordion).toContain("useVerifiedV2StepTimerRestore(");
    expect(accordion).toContain("timerSession?.authEpoch ?? null");
    expect(accordion).not.toContain("restoreTimerFromStorage(");
    expect(restore).toContain("readOwnRestoredTimer(");
    expect(restore).toContain('restored.status === "STOPPED"');
    expect(restore).toContain("binding.authEpoch !== verifiedEpoch");
  });
  it("restart must not dispatch server completion from ownerless persisted stepStore", () => {
    expect(ordinary).not.toContain("recoverCompletedSteps");
    expect(ordinary).not.toContain("recoveredCompletedStepsRef");
    expect(ordinary).not.toContain('operation: "recover_completed_step"');
  });
  it("no automatic duplicate completion writer from the restore hook or timer store", () => {
    expect(restore).not.toContain("completePracticeStep(");
    expect(restore).not.toContain("dailyCourseCompleteStep(");
    expect(restore).not.toContain("enqueue(");
    expect(accordion).toContain("timerState.authEpoch !== timerSession.authEpoch");
  });
});
