/** Real disposable localhost PostgreSQL. Never runs against any other database. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readSurveyResponseRow, readSurveyComparisonRows, readSurveyStepRow,
  readOwnedSurveyUserStepRow, writeSurveyResponseRows,
  type SurveySubmissionRowsInput,
} from "./surveyRows.js";

const enabled = process.env.GAFUS_SURVEY_ROWS_REAL_PG === "enabled" &&
  /^postgresql:\/\/surveyqa@127\.0\.0\.1:\d+\/gafus_survey_rows_qa\?schema=public$/.test(process.env.DATABASE_URL ?? "");
const suite = enabled ? describe : describe.skip;
const id = (name: string) => `survey_rows_qa_${name}`;
const owner = id("owner"), foreign = id("foreign"), courseA = id("course_a"), courseB = id("course_b");
const dayA = id("day_a"), dayB = id("day_b"), linkA = id("link_a"), linkB = id("link_b");
const stepA = id("step_a"), stepB = id("step_b"), lesson = id("lesson");
const stepLinkA = id("step_link_a"), stepLinkB = id("step_link_b"), stepLinkLesson = id("step_link_lesson");
const trainingA = id("training_a"), trainingB = id("training_b"), foreignTraining = id("training_foreign");
const ownerUserStepA = id("user_step_a"), ownerUserStepB = id("user_step_b"), foreignUserStep = id("user_step_foreign");

const submission = (params: Partial<SurveySubmissionRowsInput> = {}): SurveySubmissionRowsInput => ({
  userId: owner, courseId: courseA, stepId: stepA, userStepId: ownerUserStepA,
  userTrainingId: trainingA, surveySlug: "survey-qa-initial", surveyFamilySlug: "survey-qa",
  phase: "INITIAL", surveyVersion: 1, answers: { q: "first" }, ...params,
});

suite("survey persistence actual owner/day SQL and serializable completion", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [owner, foreign].map(user => ({
      id: user, username: user, password: "synthetic-nonlogin",
    })) });
    await prisma.course.createMany({ data: [courseA, courseB].map(course => ({
      id: course, name: course, type: course, authorId: owner,
      trainingLevel: "BEGINNER", duration: "7 days", logoImg: "",
    })) });
    await prisma.trainingDay.createMany({ data: [dayA, dayB].map(day => ({
      id: day, title: day, authorId: owner,
    })) });
    await prisma.dayOnCourse.createMany({ data: [
      { id: linkA, courseId: courseA, dayId: dayA, order: 1 },
      { id: linkB, courseId: courseB, dayId: dayB, order: 1 },
    ] });
    await prisma.step.createMany({ data: [
      { id: stepA, title: "initial", type: "SURVEY", surveySlug: "survey-qa-initial", authorId: owner },
      { id: stepB, title: "final", type: "SURVEY", surveySlug: "survey-qa-final", authorId: owner },
      { id: lesson, title: "lesson", type: "TRAINING", authorId: owner },
    ] });
    await prisma.stepOnDay.createMany({ data: [
      { id: stepLinkA, dayId: dayA, stepId: stepA, order: 1 },
      { id: stepLinkLesson, dayId: dayA, stepId: lesson, order: 2 },
      { id: stepLinkB, dayId: dayB, stepId: stepB, order: 1 },
    ] });
    await prisma.userTraining.createMany({ data: [
      { id: trainingA, userId: owner, dayOnCourseId: linkA },
      { id: trainingB, userId: owner, dayOnCourseId: linkB },
      { id: foreignTraining, userId: foreign, dayOnCourseId: linkA },
    ] });
    await prisma.userStep.createMany({ data: [
      { id: ownerUserStepA, userTrainingId: trainingA, stepOnDayId: stepLinkA },
      { id: ownerUserStepB, userTrainingId: trainingB, stepOnDayId: stepLinkB },
      { id: id("owner_lesson"), userTrainingId: trainingA, stepOnDayId: stepLinkLesson },
      { id: foreignUserStep, userTrainingId: foreignTraining, stepOnDayId: stepLinkA },
    ] });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("looks up only the owner/course-bound exact physical step, never another course or user", async () => {
    expect((await readSurveyStepRow(stepA))?.surveySlug).toBe("survey-qa-initial");
    expect((await readOwnedSurveyUserStepRow(owner, courseA, ownerUserStepA))?.userTrainingId).toBe(trainingA);
    expect(await readOwnedSurveyUserStepRow(foreign, courseA, ownerUserStepA)).toBeNull();
    expect(await readOwnedSurveyUserStepRow(owner, courseB, ownerUserStepA)).toBeNull();
    expect(await readOwnedSurveyUserStepRow(owner, courseA, foreignUserStep)).toBeNull();
  });

  it("atomically creates the answer and completes only the exact learner's physical step", async () => {
    const result = await writeSurveyResponseRows(submission(), () => true, statuses =>
      statuses.every(status => status === "COMPLETED") ? "COMPLETED" : "IN_PROGRESS");
    expect(result.kind).toBe("saved");
    expect(result.response.answers).toEqual({ q: "first" });
    expect((await readSurveyResponseRow(owner, stepA))?.id).toBe(result.response.id);
    expect(await readSurveyResponseRow(foreign, stepA)).toBeNull();
    expect((await prisma.userStep.findUniqueOrThrow({ where: { id: ownerUserStepA } })).status).toBe("COMPLETED");
    expect((await prisma.userStep.findUniqueOrThrow({ where: { id: foreignUserStep } })).status).toBe("NOT_STARTED");
    expect((await prisma.userTraining.findUniqueOrThrow({ where: { id: trainingA } })).status).toBe("IN_PROGRESS");
  });

  it("uses the post-lock edit-window policy and preserves original answers if expired", async () => {
    const stale = await writeSurveyResponseRows(submission({ answers: { q: "not saved" } }), () => false,
      () => "COMPLETED");
    expect(stale.kind).toBe("expired");
    expect((await readSurveyResponseRow(owner, stepA))?.answers).toEqual({ q: "first" });
    const revised = await writeSurveyResponseRows(submission({ answers: { q: "revised" } }), () => true,
      () => "IN_PROGRESS");
    expect(revised.kind).toBe("saved");
    expect((await readSurveyResponseRow(owner, stepA))?.answers).toEqual({ q: "revised" });
    expect(await prisma.surveyResponse.count({ where: { userId: owner, stepId: stepA } })).toBe(1);
  });

  it("refuses forged owner/course/physical occurrence inside the same DB lock", async () => {
    const before = await prisma.surveyResponse.count();
    for (const forged of [
      submission({ userId: foreign }), submission({ courseId: courseB }),
      submission({ userStepId: foreignUserStep }), submission({ stepId: stepB }),
      submission({ userTrainingId: trainingB }),
    ]) {
      await expect(writeSurveyResponseRows(forged, () => true, () => "COMPLETED"))
        .rejects.toThrow("USER_TRAINING_NOT_FOUND");
    }
    expect(await prisma.surveyResponse.count()).toBe(before);
    expect((await prisma.userTraining.findUniqueOrThrow({ where: { id: foreignTraining } })).status).toBe("NOT_STARTED");
  });

  it("rolls back both answer and progress if completion policy fails inside transaction", async () => {
    const failing = submission({
      courseId: courseB, stepId: stepB, userStepId: ownerUserStepB,
      userTrainingId: trainingB, surveySlug: "survey-qa-final", phase: "FINAL",
    });
    await expect(writeSurveyResponseRows(failing, () => true, () => { throw Error("CALCULATION_FAILED"); }))
      .rejects.toThrow("CALCULATION_FAILED");
    expect(await readSurveyResponseRow(owner, stepB)).toBeNull();
    expect((await prisma.userStep.findUniqueOrThrow({ where: { id: ownerUserStepB } })).status).toBe("NOT_STARTED");
    expect((await prisma.userTraining.findUniqueOrThrow({ where: { id: trainingB } })).status).toBe("NOT_STARTED");
  });

  it("serializes concurrent first submissions and keeps one scoped answer", async () => {
    const final = submission({
      courseId: courseB, stepId: stepB, userStepId: ownerUserStepB,
      userTrainingId: trainingB, surveySlug: "survey-qa-final", phase: "FINAL",
    });
    const [first, second] = await Promise.all([
      writeSurveyResponseRows(final, () => true, () => "COMPLETED"),
      writeSurveyResponseRows({ ...final, answers: { q: "second" } }, () => true, () => "COMPLETED"),
    ]);
    expect(first.kind).toBe("saved");
    expect(second.kind).toBe("saved");
    expect(await prisma.surveyResponse.count({ where: { userId: owner, stepId: stepB } })).toBe(1);
    expect((await prisma.userTraining.findUniqueOrThrow({ where: { id: trainingB } })).status).toBe("COMPLETED");
    const comparison = await readSurveyComparisonRows(owner, courseB, "survey-qa");
    expect(comparison).toHaveLength(1);
    expect(comparison[0]?.stepId).toBe(stepB);
  });
});
