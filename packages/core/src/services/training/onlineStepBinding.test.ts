import { describe, expect, it } from "vitest";
import type { TrainingDetail } from "@gafus/types";
import {
  onlineStepOccurrencesMatch, projectOnlineStepBinding,
} from "./onlineStepBinding";

const now = new Date("2026-11-07T12:00:00.000Z");
const dto = () => ({
  trainingDayId: "day-1",
  steps: [{ id: "step-1", order: 1, status: "IN_PROGRESS",
    locked: false, isPausedOnServer: false, remainingSecOnServer: 30 }],
}) as unknown as TrainingDetail;
const links = [{ id: "physical-1", stepId: "step-1", order: 1 }];
const progress = [{ stepOnDayId: "physical-1", status: "IN_PROGRESS",
  paused: false, remainingSec: 30, updatedAt: now }];
describe("pure, deterministic opt-in online training step binding policy", () => {
  it("does not modify source DTO and exposes no userTrainingId", () => {
    const original = dto();
    const projected = projectOnlineStepBinding(original, links, progress, now);
    expect(projected).toMatchObject({
      onlineStepBinding: "STEP_ON_DAY_ID_V1",
      serverNow: "2026-11-07T12:00:00.000Z",
      steps: [{stepOnDayId: "physical-1", timerSnapshot: {
        remainingSecAtServerNow: 30,
        expiresAt: "2026-11-07T12:00:30.000Z",
      }}],
    });
    expect(original.steps[0]).not.toHaveProperty("stepOnDayId");
  });
  it("returns the exact untouched DTO on physical occurrence mismatch", () => {
    const original=dto();
    expect(onlineStepOccurrencesMatch(original,[{...links[0],stepId:"different"}])).toBe(false);
    expect(projectOnlineStepBinding(original,[{...links[0],stepId:"different"}],progress,now))
      .toBe(original);
  });
  it("returns the untouched DTO when persisted state differs from read model", () => {
    const original=dto();
    expect(projectOnlineStepBinding(original,links,
      [{...progress[0],status:"COMPLETED"}],now)).toBe(original);
  });
  it("never binds locked step or reveals private progress", () => {
    const original=dto();
    original.steps[0]!.locked=true;
    const projected=projectOnlineStepBinding(original,links,progress,now);
    expect(projected.steps[0]).toEqual(original.steps[0]);
    expect(JSON.stringify(projected)).not.toContain("userTrainingId");
  });
});
