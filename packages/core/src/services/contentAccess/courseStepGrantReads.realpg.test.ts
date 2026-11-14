/** Local synthetic DB only. Exact occurrence grant checks; no cloud/provider calls. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { hasActiveGafusCourseStepAccess, hasAllowedVideoCourseStepAccess } from "./index";
import { registerCourseOccurrenceReadsPort } from "./index";
import { readActiveCourseStepGafusGrant, readAllowedVideoCourseStepAccess } from "@gafus/entitlements-server";
registerCourseOccurrenceReadsPort({ readActiveCourseStepGafusGrant, readAllowedVideoCourseStepAccess });


const db = process.env.DATABASE_URL ?? "";
const real =
  process.env.GAFUS_STEP_ACCESS_REAL_PG === "enabled" &&
  /^postgresql:\/\/stepaccessqa@127\.0\.0\.1:\d+\/gafus_step_access_qa\?schema=public$/.test(db);
const suite = real ? describe : describe.skip;
const ids = { owner: "step_owner", viewer: "step_viewer", outsider: "step_outsider" };
let paid = { course: "", link: "", step: "", freeStep: "" };
let guide = { course: "", link: "", step: "", step2: "" };
let privateStep = { course: "", link: "", step: "" };
let unrelatedPaid = { course: "", link: "", step: "" };
const today = new Date();
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function courseFixture(
  type: string,
  options: { isPaid?: boolean; isPrivate?: boolean; guideContent?: string } = {},
) {
  const course = await prisma.course.create({
    data: {
      name: type,
      type,
      duration: "1",
      logoImg: "",
      trainingLevel: "BEGINNER",
      authorId: ids.owner,
      ...options,
    },
  });
  const day = await prisma.trainingDay.create({ data: { title: type, authorId: ids.owner } });
  const link = await prisma.dayOnCourse.create({
    data: { courseId: course.id, dayId: day.id, order: 1 },
  });
  const step = await prisma.step.create({
    data: { title: `${type} lesson`, authorId: ids.owner, type: "PRACTICE" },
  });
  const stepLink = await prisma.stepOnDay.create({
    data: { dayId: day.id, stepId: step.id, order: 1 },
  });
  return { course: course.id, link: link.id, step: stepLink.id, dayId: day.id };
}
async function grant(
  type: "COURSE_STEP" | "MINI_GUIDE",
  targetKey: string,
  courseId: string,
  expiresAt: Date,
  extra: { dayOnCourseId?: string; stepOnDayId?: string } = {},
) {
  const tx = await prisma.gafusTransaction.create({
    data: {
      userId: ids.viewer,
      kind: "SPEND",
      delta: -1,
      balanceBefore: 2,
      balanceAfter: 1,
      idempotencyKey: `qa-step-grant:${targetKey}`,
      targetType: type,
      targetKey,
      settingsRevision: 1,
    },
  });
  return prisma.gafusTargetAccess.create({
    data: {
      userId: ids.viewer,
      targetType: type,
      targetKey,
      courseId,
      transactionId: tx.id,
      settingsRevision: 1,
      expiresAt,
      ...extra,
    },
  });
}

suite("course and step occurrence entitlements with real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ids.owner, ids.viewer, ids.outsider].map((id) => ({
        id,
        username: id,
        password: "synthetic_nonlogin",
        role: id === ids.owner ? "TRAINER" : "USER",
      })),
    });
    const a = await courseFixture("step_access_paid", { isPaid: true });
    const free = await prisma.step.create({
      data: { title: "Rest", type: "BREAK", authorId: ids.owner },
    });
    paid = {
      course: a.course,
      link: a.link,
      step: a.step,
      freeStep: (
        await prisma.stepOnDay.create({ data: { dayId: a.dayId, stepId: free.id, order: 2 } })
      ).id,
    };
    const b = await courseFixture("step_access_guide", {
      isPaid: true,
      guideContent: "guide text",
    });
    const s = await prisma.step.create({
      data: { title: "Guide lesson 2", type: "PRACTICE", authorId: ids.owner },
    });
    guide = {
      course: b.course,
      link: b.link,
      step: b.step,
      step2: (await prisma.stepOnDay.create({ data: { dayId: b.dayId, stepId: s.id, order: 2 } }))
        .id,
    };
    unrelatedPaid = await courseFixture("step_access_unrelated_paid", { isPaid: true });
    const c = await courseFixture("step_access_private", { isPaid: true, isPrivate: true });
    privateStep = { course: c.course, link: c.link, step: c.step };
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  const args = (link: string, step: string, userId = ids.viewer, now = today) => ({
    userId,
    dayOnCourseId: link,
    stepOnDayId: step,
    now,
  });
  it("rejects absent grants, free child steps, foreign users and mismatched day occurrences", async () => {
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, paid.step))).toBe(false);
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, paid.freeStep))).toBe(false);
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, privateStep.step))).toBe(false);
    expect(await hasActiveGafusCourseStepAccess(args(privateStep.link, paid.step))).toBe(false);
    expect(await hasActiveGafusCourseStepAccess(args("bad_id", paid.step))).toBe(false);
  });
  it("valid paid occurrence grant is bound to one user, one step and strict expiry", async () => {
    await grant("COURSE_STEP", `course-step:${paid.link}:${paid.step}`, paid.course, tomorrow, {
      dayOnCourseId: paid.link,
      stepOnDayId: paid.step,
    });
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, paid.step))).toBe(true);
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, paid.step, ids.outsider))).toBe(
      false,
    );
    expect(
      await hasActiveGafusCourseStepAccess(args(paid.link, paid.step, ids.viewer, tomorrow)),
    ).toBe(false);
    expect(await hasActiveGafusCourseStepAccess(args(paid.link, paid.freeStep))).toBe(false);
  });
  it("one guide grant unlocks only that guide's two paid children, never an unrelated course", async () => {
    await grant("MINI_GUIDE", `mini-guide:${guide.course}`, guide.course, tomorrow);
    expect(await hasActiveGafusCourseStepAccess(args(guide.link, guide.step))).toBe(true);
    expect(await hasActiveGafusCourseStepAccess(args(guide.link, guide.step2))).toBe(true);
    expect(await hasActiveGafusCourseStepAccess(args(unrelatedPaid.link, unrelatedPaid.step))).toBe(
      false,
    );
    expect(await hasActiveGafusCourseStepAccess(args(guide.link, guide.step2, ids.outsider))).toBe(
      false,
    );
    expect(
      await hasActiveGafusCourseStepAccess(args(guide.link, guide.step, ids.viewer, tomorrow)),
    ).toBe(false);
  });
  it("a private step is never Gafus-unlocked; video access needs an assignment", async () => {
    await grant(
      "COURSE_STEP",
      `course-step:${privateStep.link}:${privateStep.step}`,
      privateStep.course,
      tomorrow,
      { dayOnCourseId: privateStep.link, stepOnDayId: privateStep.step },
    );
    expect(await hasActiveGafusCourseStepAccess(args(privateStep.link, privateStep.step))).toBe(
      false,
    );
    expect(
      await hasAllowedVideoCourseStepAccess(ids.viewer, privateStep.link, privateStep.step, today),
    ).toBe(false);
    await prisma.courseAccess.create({
      data: { userId: ids.viewer, courseId: privateStep.course },
    });
    expect(
      await hasAllowedVideoCourseStepAccess(ids.viewer, privateStep.link, privateStep.step, today),
    ).toBe(true);
    expect(
      await hasAllowedVideoCourseStepAccess(
        ids.outsider,
        privateStep.link,
        privateStep.step,
        today,
      ),
    ).toBe(false);
    expect(
      await hasAllowedVideoCourseStepAccess(ids.viewer, paid.link, privateStep.step, today),
    ).toBe(false);
  });
});
