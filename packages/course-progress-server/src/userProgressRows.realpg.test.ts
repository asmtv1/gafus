/** Disposable loopback PostgreSQL-only owner and step-occurrence progress checks. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readOwnedCourseProgressRow,
  readCourseDaysProgressRows,
  readSharedCompletedTrainingRows,
  readOwnedCourseTrainingStatuses,
  readTrainingStartedSteps,
  writeOwnedUserCourseProgress,
  readProgressDisplayAccount,
  readOwnedCourseTrainingTimeline,
  readOwnedCourseTrainingDayRows,
} from "./userProgressRows.js";

const url = process.env.DATABASE_URL ?? "";
const enabled =
  process.env.GAFUS_USER_PROGRESS_REAL_PG === "enabled" &&
  /^postgresql:\/\/progressqa@127\.0\.0\.1:\d+\/gafus_user_progress_qa\?schema=public$/.test(url);
const suite = enabled ? describe : describe.skip;
const ids = {
  owner: "progress_user_owner",
  other: "progress_user_other",
  course: "progress_course_A",
  day: "progress_day_A",
  step: "progress_step_A",
};
let dayLinkId = "",
  stepLinkId = "",
  ownerTrainingId = "",
  otherTrainingId = "";

suite("real PostgreSQL owner/course-scoped detailed progress projection", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ids.owner, ids.other].map((id) => ({
        id,
        username: id,
        password: "synthetic_no_login",
      })),
    });
    await prisma.course.create({
      data: {
        id: ids.course,
        name: "QA owned course",
        type: "qa_progress_course",
        duration: "1",
        logoImg: "",
        trainingLevel: "BEGINNER",
        authorId: ids.owner,
      },
    });
    await prisma.trainingDay.create({
      data: { id: ids.day, title: "Day", authorId: ids.owner, shareProgressAcrossCourses: true },
    });
    await prisma.step.create({ data: { id: ids.step, title: "Sit", authorId: ids.owner } });
    const link = await prisma.dayOnCourse.create({
      data: { dayId: ids.day, courseId: ids.course, order: 1 },
    });
    dayLinkId = link.id;
    const sl = await prisma.stepOnDay.create({
      data: { dayId: ids.day, stepId: ids.step, order: 1 },
    });
    stepLinkId = sl.id;
    await prisma.userCourse.createMany({
      data: [
        { userId: ids.owner, courseId: ids.course, status: "NOT_STARTED" },
        { userId: ids.other, courseId: ids.course, status: "NOT_STARTED" },
      ],
    });
    const own = await prisma.userTraining.create({
      data: { userId: ids.owner, dayOnCourseId: dayLinkId, status: "IN_PROGRESS" },
    });
    const foreign = await prisma.userTraining.create({
      data: { userId: ids.other, dayOnCourseId: dayLinkId, status: "COMPLETED" },
    });
    ownerTrainingId = own.id;
    otherTrainingId = foreign.id;
    await prisma.userStep.createMany({
      data: [
        { userTrainingId: ownerTrainingId, stepOnDayId: stepLinkId, status: "IN_PROGRESS" },
        { userTrainingId: otherTrainingId, stepOnDayId: stepLinkId, status: "COMPLETED" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("returns the exact owner enrollment and ordered course day/step without merging another user", async () => {
    const own = await readOwnedCourseProgressRow(ids.owner, ids.course);
    expect(own?.user.username).toBe(ids.owner);
    const days = await readCourseDaysProgressRows(ids.course);
    expect(days).toHaveLength(1);
    expect(days[0]?.id).toBe(dayLinkId);
    expect(days[0]?.day.stepLinks.map((x) => x.id)).toEqual([stepLinkId]);
    expect((await readProgressDisplayAccount(ids.owner))?.username).toBe(ids.owner);
    expect(await readOwnedCourseProgressRow("missing_owner", ids.course)).toBeNull();
  });
  it("finds only this actor's training and relevant step occurrence, not another actor's completion", async () => {
    const own = await readOwnedCourseTrainingStatuses(ids.owner, ids.course);
    expect(own.map((x) => x.id)).toEqual([ownerTrainingId]);
    const ownDay = await readOwnedCourseTrainingDayRows(ids.owner, ids.course);
    expect(ownDay.map((x) => x.id)).toEqual([ownerTrainingId]);
    expect(ownDay[0]?.steps.map((x) => x.stepOnDayId)).toEqual([stepLinkId]);
    const time = await readOwnedCourseTrainingTimeline(ids.owner, ids.course);
    expect(time).toHaveLength(1);
    const started = await readTrainingStartedSteps([ownerTrainingId]);
    expect(started).toHaveLength(1);
    expect(await readSharedCompletedTrainingRows(ids.owner, [ids.day])).toEqual([]);
    expect(await readSharedCompletedTrainingRows(ids.other, [ids.day])).toHaveLength(1);
  });
  it("syncs only the caller's enrollment and rejects noncanonical status before SQL", async () => {
    await expect(() =>
      writeOwnedUserCourseProgress(ids.owner, ids.course, { status: "DELETED", startedAt: null }),
    ).toThrow("USER_COURSE_PROGRESS_STATUS_INVALID");
    const startedAt = new Date("2026-11-09T09:15:00Z");
    await writeOwnedUserCourseProgress(ids.owner, ids.course, { status: "IN_PROGRESS", startedAt });
    const own = await prisma.userCourse.findUniqueOrThrow({
      where: { userId_courseId: { userId: ids.owner, courseId: ids.course } },
    });
    const foreign = await prisma.userCourse.findUniqueOrThrow({
      where: { userId_courseId: { userId: ids.other, courseId: ids.course } },
    });
    expect(own.status).toBe("IN_PROGRESS");
    expect(own.startedAt).toEqual(startedAt);
    expect(foreign.status).toBe("NOT_STARTED");
  });
});
