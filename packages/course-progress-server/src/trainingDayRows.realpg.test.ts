/** Real disposable PostgreSQL ACL, transactional step replacement and cascade.
 * Never point this test at production. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { deleteTrainingDayRows, insertTrainingDay, listVisibleTrainingDays,
  readTrainingDayForEdit, replaceTrainingDay } from "./trainingDayRows.js";

const url = process.env.DATABASE_URL ?? "";
const active = process.env.GAFUS_TRAINING_DAY_REAL_PG === "enabled" &&
  /^postgresql:\/\/trainingdayqa@127\.0\.0\.1:\d+\/gafus_training_day_qa\?schema=public$/.test(url);
const describeReal = active ? describe : describe.skip;
const ids = {
  owner: "train_day_qa_owner", stranger: "train_day_qa_other",
  step1: "train_day_qa_step1", step2: "train_day_qa_step2",
};
let dayId = "", courseId = "";
const owner = { id: ids.owner, role: "TRAINER" as const };
const stranger = { id: ids.stranger, role: "TRAINER" as const };

describeReal("real PostgreSQL trainer day ownership and revision", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [ids.owner, ids.stranger].map(id => ({
      id, username: id, password: "non-login-synthetic", role: "TRAINER" as const,
    })) });
    await prisma.step.createMany({ data: [
      { id: ids.step1, authorId: ids.owner, title: "owned step" },
      { id: ids.step2, authorId: ids.stranger, title: "foreign step" },
    ] });
    const createInput = {
      title: "Private training day", authorId: ids.owner,
      stepIds: [ids.step1, ids.step1],
    };
    await expect(insertTrainingDay({ ...createInput, stepIds: [ids.step1, ids.step2] }, owner))
      .rejects.toThrow("STEP_OWNER_MISMATCH");
    await expect(insertTrainingDay(createInput, stranger))
      .rejects.toThrow("DAY_AUTHOR_MISMATCH");
    expect(await prisma.trainingDay.count()).toBe(0);
    const created = await insertTrainingDay(createInput, owner);
    dayId = created.id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("persists duplicate step occurrences and only lists the trainer's own days", async () => {
    const links = await prisma.stepOnDay.findMany({ where: { dayId }, orderBy: { order: "asc" } });
    expect(links.map(row => [row.stepId, row.order])).toEqual([[ids.step1, 1], [ids.step1, 2]]);
    expect((await readTrainingDayForEdit(dayId, stranger))).toBeNull();
    expect((await readTrainingDayForEdit(dayId, owner))?.id).toBe(dayId);
    expect((await listVisibleTrainingDays(ids.stranger, false)).some(row => row.id === dayId)).toBe(false);
    expect((await listVisibleTrainingDays(ids.owner, false)).some(row => row.id === dayId)).toBe(true);
  });

  it("foreign step fails inside the same write transaction with no deleted links or partial edit", async () => {
    const before = await prisma.stepOnDay.findMany({ where: { dayId }, orderBy: { order: "asc" } });
    await expect(replaceTrainingDay({ id: dayId, title: "illegal foreign step", stepIds: [ids.step1, ids.step2] }, owner))
      .rejects.toThrow("STEP_OWNER_MISMATCH");
    expect((await prisma.trainingDay.findUniqueOrThrow({ where: { id: dayId } })).title).toBe("Private training day");
    const after = await prisma.stepOnDay.findMany({ where: { dayId }, orderBy: { order: "asc" } });
    expect(after).toEqual(before);
  });

  it("foreign trainer cannot write another author's day even with their own valid step", async () => {
    await expect(replaceTrainingDay({ id: dayId, title: "hijack", stepIds: [ids.step2] }, stranger)).rejects.toThrow();
    expect((await prisma.trainingDay.findUniqueOrThrow({ where: { id: dayId } })).title).toBe("Private training day");
  });

  it("authorized replacement writes precisely ordered repeated occurrences", async () => {
    await replaceTrainingDay({ id: dayId, title: "updated", stepIds: [ids.step1, ids.step1] }, owner);
    const links = await prisma.stepOnDay.findMany({ where: { dayId }, orderBy: { order: "asc" } });
    expect(links.map(row => [row.stepId, row.order])).toEqual([[ids.step1, 0], [ids.step1, 1]]);
    expect((await prisma.trainingDay.findUniqueOrThrow({ where: { id: dayId } })).title).toBe("updated");
  });

  it("foreign deletion rolls back, duplicate IDs fail closed, owner deletion unlinks course exactly once", async () => {
    const course = await prisma.course.create({ data: {
      name: "qa course", type: "qa_training_day_local", duration: "1", logoImg: "", trainingLevel: "BEGINNER", authorId: ids.owner,
    } });
    courseId = course.id;
    await prisma.dayOnCourse.create({ data: { courseId, dayId, order: 1 } });
    await expect(deleteTrainingDayRows([dayId], stranger)).rejects.toThrow("DAY_NOT_FOUND");
    expect(await prisma.dayOnCourse.count({ where: { dayId } })).toBe(1);
    expect(await deleteTrainingDayRows([dayId, dayId], owner)).toBeNull();
    expect(await prisma.trainingDay.count({ where: { id: dayId } })).toBe(1);
    expect(await deleteTrainingDayRows([dayId], owner)).toEqual({
      deletedDayIds: [dayId], courseIds: [courseId],
    });
    expect(await prisma.trainingDay.count({ where: { id: dayId } })).toBe(0);
    expect(await prisma.dayOnCourse.count({ where: { dayId } })).toBe(0);
    expect(await prisma.stepOnDay.count({ where: { dayId } })).toBe(0);
  });
});
