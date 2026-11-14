import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), list: vi.fn(), del: vi.fn(),
  stepCount: vi.fn(), linksList: vi.fn(), linksDel: vi.fn(),
  tx: vi.fn(),
}));
const tx = {
  step: { count: m.stepCount },
  trainingDay: { create: m.create, update: m.update, findMany: m.list, deleteMany: m.del },
  dayOnCourse: { findMany: m.linksList, deleteMany: m.linksDel },
};
vi.mock("@gafus/prisma", () => ({
  prisma: {
    trainingDay: { create: m.create, update: m.update, findMany: m.list,
      deleteMany: m.del, findUnique: vi.fn() },
    dayOnCourse: { findMany: m.linksList, deleteMany: m.linksDel },
    $transaction: m.tx,
  },
}));
import { insertTrainingDay, replaceTrainingDay, deleteTrainingDayRows,
  listVisibleTrainingDays, readTrainingDayForEdit } from "./trainingDayRows.js";

const input = {
  id: "day-1", title: "Training", stepIds: ["step-A", "step-B", "step-A"],
  description: "test", type: "regular", equipment: "", authorId: "owner-A",
};
const owner = { id: "owner-A", role: "TRAINER" as const };

beforeEach(() => {
  vi.clearAllMocks();
  m.tx.mockImplementation(async (callback: unknown) => Array.isArray(callback)
    ? Promise.all(callback) : (callback as (tx: typeof tx) => Promise<unknown>)(tx));
  m.create.mockResolvedValue({ id: "new-day" });
  m.update.mockResolvedValue({ id: "day-1" });
  m.stepCount.mockResolvedValue(2);
  m.list.mockResolvedValue([{ id: "day-1" }]);
  m.del.mockResolvedValue({ count: 1 });
  m.linksList.mockResolvedValue([{ courseId: "course-A" }, { courseId: "course-A" }]);
  m.linksDel.mockResolvedValue({ count: 1 });
});

describe("training-day repository ownership and atomicity", () => {
  it("creates separate occurrences for repeated steps in their original order", async () => {
    expect((await insertTrainingDay(input)).id).toBe("new-day");
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      authorId: "owner-A", stepLinks: { create: [
        { stepId: "step-A", order: 1 },
        { stepId: "step-B", order: 2 },
        { stepId: "step-A", order: 3 },
      ] },
    }) });
  });
  it("requires authenticated writer identity and atomic ownership before creating a day", async () => {
    await expect(insertTrainingDay(input, { id: "intruder", role: "ADMIN" })).rejects.toThrow("DAY_AUTHOR_MISMATCH");
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    await insertTrainingDay(input, owner);
    expect(m.tx).toHaveBeenCalledOnce();
    expect(m.stepCount).toHaveBeenCalledWith({where:{ id: {in: ["step-A", "step-B"]}, authorId: "owner-A" }});
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("refuses a foreign step during creation and does not call INSERT", async () => {
    m.stepCount.mockResolvedValueOnce(1);
    await expect(insertTrainingDay(input, owner)).rejects.toThrow("STEP_OWNER_MISMATCH");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("scopes trainer reads/writes to author and validates all distinct step owners within a transaction", async () => {
    await readTrainingDayForEdit("day-1", owner);
    await replaceTrainingDay(input, owner);
    expect(m.tx).toHaveBeenCalledOnce();
    expect(m.stepCount).toHaveBeenCalledWith({ where: {
      id: { in: ["step-A", "step-B"] }, authorId: "owner-A",
    } });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "day-1", authorId: "owner-A" },
      data: expect.objectContaining({ stepLinks: { deleteMany: {}, create: [
        { stepId: "step-A", order: 0 },
        { stepId: "step-B", order: 1 },
        { stepId: "step-A", order: 2 },
      ] } }),
    });
  });
  it("rejects foreign/unregistered steps before altering the training day", async () => {
    m.stepCount.mockResolvedValue(1);
    await expect(replaceTrainingDay(input, owner)).rejects.toThrow("STEP_OWNER_MISMATCH");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("denies foreign training day deletion before reading linked courses or changing data", async () => {
    m.list.mockResolvedValue([]);
    await expect(deleteTrainingDayRows(["day-1"], owner)).rejects.toThrow("DAY_NOT_FOUND");
    expect(m.linksList).not.toHaveBeenCalled();
    expect(m.linksDel).not.toHaveBeenCalled();
    expect(m.del).not.toHaveBeenCalled();
  });
  it("deduplicates attached course IDs and deletes only actor-scoped day IDs atomically", async () => {
    const result = await deleteTrainingDayRows(["day-1"], owner);
    expect(result).toEqual({ courseIds: ["course-A"], deletedDayIds: ["day-1"] });
    expect(m.list).toHaveBeenCalledWith({ where: { id: { in: ["day-1"] }, authorId: "owner-A" }, select: { id: true } });
    expect(m.del).toHaveBeenCalledWith({ where: { id: { in: ["day-1"] }, authorId: "owner-A" } });
    expect(m.tx).toHaveBeenCalledOnce();
  });
  it("detects zero-row delete races and refuses to return success", async () => {
    m.del.mockResolvedValue({ count: 0 });
    await expect(deleteTrainingDayRows(["day-1"], owner)).rejects.toThrow("DAY_DELETE_RACE");
  });
  it("rejects duplicate day IDs instead of deleting the same row twice", async () => {
    await expect(deleteTrainingDayRows(["day-1", "day-1"], owner)).resolves.toBeNull();
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("keeps legacy admin mutation behavior without trusting caller role on trainer path", async () => {
    await replaceTrainingDay(input);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "day-1" } }));
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("filters trainer listings by exact owner, but admin listings are unrestricted", async () => {
    await listVisibleTrainingDays("owner-A", false);
    expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({ where: { authorId: "owner-A" } }));
    await listVisibleTrainingDays(null, true);
    expect(m.list).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });
});
