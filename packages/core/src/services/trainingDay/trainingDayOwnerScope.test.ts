import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDays, getTrainingDayForEdit, updateTrainingDay,
} from "./trainingDayService";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
  stepCount: vi.fn(),
  dayOnCourseFindMany: vi.fn(), dayOnCourseDeleteMany: vi.fn(),
  invalidate: vi.fn(), publish: vi.fn(async () => undefined),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    trainingDay: {
      findUnique: m.findUnique, findMany: m.findMany,
      update: m.update, deleteMany: m.deleteMany,
    },
    dayOnCourse: { findMany: m.dayOnCourseFindMany, deleteMany: m.dayOnCourseDeleteMany },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      trainingDay: { findMany: m.findMany, update: m.update, deleteMany: m.deleteMany },
      step: { count: m.stepCount },
      dayOnCourse: { findMany: m.dayOnCourseFindMany, deleteMany: m.dayOnCourseDeleteMany },
    }),
  },
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateTrainingDaysContentCache: m.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: m.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
const actor = { id: "trainer-A", role: "TRAINER" as const };
const input = { id: "day-1", title: "День", stepIds: ["step-1"] };
beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockResolvedValue({});
  m.stepCount.mockResolvedValue(1);
  m.dayOnCourseFindMany.mockResolvedValue([{ courseId: "course-1" }]);
  m.dayOnCourseDeleteMany.mockResolvedValue({ count: 1 });
  m.deleteMany.mockResolvedValue({ count: 1 });
});
describe("Core training-day mutation owner scope", () => {
  it("uses authorId as a Prisma update predicate", async () => {
    expect((await updateTrainingDay(input, actor)).success).toBe(true);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: input.id, authorId: actor.id },
    }));
    expect(m.invalidate).toHaveBeenCalledWith([input.id]);
  });
  it("allows repeated occurrences while checking ownership once per unique step", async () => {
    const ids = ["step-1", "step-2", "step-1"];
    m.stepCount.mockResolvedValueOnce(2);
    expect((await updateTrainingDay({ ...input, stepIds: ids }, actor)).success).toBe(true);
    expect(m.stepCount).toHaveBeenCalledWith({
      where: { id: { in: ["step-1", "step-2"] }, authorId: actor.id },
    });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ stepLinks: {
        deleteMany: {}, create: [
          { stepId: "step-1", order: 0 },
          { stepId: "step-2", order: 1 },
          { stepId: "step-1", order: 2 },
        ],
      } }),
    }));
  });
  it("blocks attaching foreign steps in the same transaction as the update", async () => {
    m.stepCount.mockResolvedValueOnce(0);
    const result = await updateTrainingDay(input, actor);
    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.stepCount).toHaveBeenCalledWith({
      where: { id: { in: input.stepIds }, authorId: actor.id },
    });
  });
  it("requires owner for edit read, admin can read any day", async () => {
    m.findUnique.mockResolvedValue(null);
    await getTrainingDayForEdit(input.id, actor);
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: input.id, authorId: actor.id },
    }));
    await getTrainingDayForEdit(input.id, { id: "admin", role: "ADMIN" });
    expect(m.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: input.id },
    }));
  });
  it("does not delete anything if any requested day is foreign", async () => {
    m.findMany.mockResolvedValue([{ id: "day-own" }]);
    const result = await deleteDays({ dayIds: ["day-own", "day-foreign"] }, actor);
    expect(result.success).toBe(false);
    expect(m.dayOnCourseDeleteMany).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("deletes owner day in a transaction with exact predicates", async () => {
    m.findMany.mockResolvedValue([{ id: input.id }]);
    const result = await deleteDays({ dayIds: [input.id] }, actor);
    expect(result).toEqual({
      success: true, courseIds: ["course-1"], deletedDayIds: [input.id],
    });
    expect(m.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [input.id] }, authorId: actor.id },
    });
    expect(m.publish).toHaveBeenCalledTimes(1);
  });
});
