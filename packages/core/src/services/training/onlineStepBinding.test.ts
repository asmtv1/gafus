import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingDetail } from "@gafus/types";

const db = vi.hoisted(() => ({
  links: vi.fn(),
  training: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    stepOnDay: { findMany: db.links },
    userTraining: { findUnique: db.training },
    userStep: { findMany: db.progress },
  },
}));
import { withOnlineStepBinding } from "./onlineStepBinding";

// Only the relevant DTO fields are needed for this read-only projection.
const detail = (): TrainingDetail =>
  ({
    trainingDayId: "day1",
    steps: [
      {
        id: "step1",
        order: 1,
        status: "IN_PROGRESS",
        isPausedOnServer: false,
        remainingSecOnServer: 30,
        locked: false,
      },
    ],
  }) as unknown as TrainingDetail;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"));
  db.links.mockReset().mockResolvedValue([{ id: "occ1", stepId: "step1", order: 1 }]);
  db.training.mockReset().mockResolvedValue({ id: "training1" });
  db.progress
    .mockReset()
    .mockResolvedValue([
      {
        stepOnDayId: "occ1",
        status: "IN_PROGRESS",
        paused: false,
        remainingSec: 30,
        updatedAt: new Date("2026-11-02T12:00:00.000Z"),
      },
    ]);
});
afterEach(() => vi.useRealTimers());

describe("opt-in online step binding", () => {
  it("binds only the matching occurrence with a bounded server timer", async () => {
    const original = detail();
    const value = await withOnlineStepBinding("actor", "day-on-course", original);
    expect(value).toMatchObject({
      serverNow: "2026-11-02T12:00:00.000Z",
      onlineStepBinding: "STEP_ON_DAY_ID_V1",
      steps: [
        {
          stepOnDayId: "occ1",
          timerSnapshot: {
            remainingSecAtServerNow: 30,
            expiresAt: "2026-11-02T12:00:30.000Z",
          },
        },
      ],
    });
    expect(original.steps[0]).not.toHaveProperty("stepOnDayId");
    expect(JSON.stringify(value)).not.toContain("training1");
    expect(db.training).toHaveBeenCalledWith({
      where: { userId_dayOnCourseId: { userId: "actor", dayOnCourseId: "day-on-course" } },
      select: { id: true },
    });
  });

  it("fails closed if physical step mapping does not match rendered DTO", async () => {
    db.links.mockResolvedValue([{ id: "occ1", stepId: "other", order: 1 }]);
    const original = detail();
    expect(await withOnlineStepBinding("actor", "day-on-course", original)).toBe(original);
    expect(db.training).not.toHaveBeenCalled();
  });

  it("fails closed on a concurrent progress change", async () => {
    db.progress.mockResolvedValue([
      {
        stepOnDayId: "occ1",
        status: "COMPLETED",
        paused: false,
        remainingSec: 30,
        updatedAt: new Date(),
      },
    ]);
    const original = detail();
    expect(await withOnlineStepBinding("actor", "day-on-course", original)).toBe(original);
  });

  it("does not mutate locked/hidden steps", async () => {
    const original = detail();
    original.steps[0].locked = true;
    const value = await withOnlineStepBinding("actor", "day-on-course", original);
    expect(value.steps[0]).toEqual(original.steps[0]);
    expect(value.steps[0]).not.toHaveProperty("stepOnDayId");
  });

  it("does not create training progress for users without existing training", async () => {
    db.training.mockResolvedValue(null);
    const value = await withOnlineStepBinding("actor", "day-on-course", detail());
    expect(db.progress).not.toHaveBeenCalled();
    expect(value).toHaveProperty("onlineStepBinding", "STEP_ON_DAY_ID_V1");
  });
});
