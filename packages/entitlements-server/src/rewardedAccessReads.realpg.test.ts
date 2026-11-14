/** Fresh disposable loopback PostgreSQL only; never on a staging/production DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readOwnedCourseDayRewardedSteps, readOwnedRewardedUserStep,
  readRewardedPrivateCourseAssignment, readOwnedDailyRewardedUserStep,
  readPublishedDailyRewardedVideo, readOwnedRewardedVideoStep,
  readActiveLegacyRewardedGrant, readRewardedViewerRole,
  readRewardedCourseVideoOccurrences, readPendingRewardedStepNotificationUrl,
} from "./rewardedAccessReads.js";

const enabled = process.env.GAFUS_REWARDED_ACCESS_REAL_PG === "enabled" &&
  /^postgresql:\/\/rewardedqa@127\.0\.0\.1:\d+\/gafus_rewarded_reads_qa\?schema=public$/.test(process.env.DATABASE_URL ?? "");
const suite = enabled ? describe : describe.skip;
const id = (name: string) => `rewacc_qa_${name}`;
const owner = id("owner"), other = id("other"), paid = id("course_paid"), priv = id("course_private");
const paidDay = id("paid_day"), privateDay = id("private_day");
const paidLink = id("paid_link"), privateLink = id("private_link");
const paidStep = id("paid_step"), privateStep = id("private_step"), paidStepLink = id("paid_step_link"), privateStepLink = id("private_step_link");
const ownTraining = id("own_training"), foreignTraining = id("foreign_training");
const ownUserStep = id("own_user_step"), foreignUserStep = id("foreign_user_step");
const bundle = id("daily_bundle"), bundleStep = id("bundle_step"), schedule = id("schedule");
const dailyTraining = id("daily_training"), dailyUserStep = id("daily_user_step");
const sharedVideo = "private://test-rewarded-shared-video";

suite("owner/occurrence-bound rewarded access reads on actual PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [owner, other].map(userId => ({
      id: userId, username: userId, password: "synthetic-nonlogin",
    })) });
    await prisma.course.createMany({ data: [
      { id: paid, name: paid, type: paid, authorId: owner, trainingLevel: "BEGINNER", duration: "1", logoImg: "", isPaid: true },
      { id: priv, name: priv, type: priv, authorId: owner, trainingLevel: "BEGINNER", duration: "1", logoImg: "", isPaid: true, isPrivate: true },
    ] });
    await prisma.trainingDay.createMany({ data: [paidDay, privateDay].map(day => ({ id: day, title: day, authorId: owner })) });
    await prisma.dayOnCourse.createMany({ data: [
      { id: paidLink, courseId: paid, dayId: paidDay, order: 1 },
      { id: privateLink, courseId: priv, dayId: privateDay, order: 1 },
    ] });
    await prisma.step.createMany({ data: [
      { id: paidStep, authorId: owner, title: "paid video", type: "TRAINING", videoUrl: sharedVideo },
      { id: privateStep, authorId: owner, title: "private video", type: "SURVEY", videoUrl: sharedVideo },
    ] });
    await prisma.stepOnDay.createMany({ data: [
      { id: paidStepLink, dayId: paidDay, stepId: paidStep, order: 1 },
      { id: privateStepLink, dayId: privateDay, stepId: privateStep, order: 1 },
    ] });
    await prisma.userTraining.createMany({ data: [
      { id: ownTraining, userId: owner, dayOnCourseId: paidLink },
      { id: foreignTraining, userId: other, dayOnCourseId: paidLink },
    ] });
    await prisma.userStep.createMany({ data: [
      { id: ownUserStep, userTrainingId: ownTraining, stepOnDayId: paidStepLink },
      { id: foreignUserStep, userTrainingId: foreignTraining, stepOnDayId: paidStepLink },
    ] });
    await prisma.dailyCourseBundle.create({ data: { id: bundle, title: "daily free", authorId: owner } });
    await prisma.dailyCourseBundleStep.create({ data: { id: bundleStep, bundleId: bundle, stepId: paidStep, order: 1 } });
    await prisma.dailyCourseSchedule.create({ data: {
      id: schedule, bundleId: bundle, createdById: owner,
      date: new Date("2026-11-09T00:00:00.000Z"), isPublished: true,
    } });
    await prisma.dailyCourseUserTraining.create({ data: { id: dailyTraining, userId: owner, scheduleId: schedule } });
    await prisma.dailyCourseUserStep.create({ data: { id: dailyUserStep, dailyCourseUserTrainingId: dailyTraining, bundleStepId: bundleStep } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("never reads another user's course day or physical progress row", async () => {
    expect((await readOwnedCourseDayRewardedSteps(owner, paidLink))?.day.stepLinks[0]?.id).toBe(paidStepLink);
    expect(await readOwnedCourseDayRewardedSteps(owner, privateLink)).toBeNull();
    expect(await readOwnedCourseDayRewardedSteps(other, privateLink)).toBeNull();
    expect((await readOwnedRewardedUserStep(owner, ownUserStep))?.stepOnDay.id).toBe(paidStepLink);
    expect(await readOwnedRewardedUserStep(other, ownUserStep)).toBeNull();
    expect(await readOwnedRewardedUserStep(owner, foreignUserStep)).toBeNull();
    expect(await readOwnedRewardedUserStep("", ownUserStep)).toBeNull();
  });

  it("private assignment requires an exact user/course pair and is revoked immediately", async () => {
    expect(await readRewardedPrivateCourseAssignment(owner, priv)).toBeNull();
    await prisma.courseAccess.create({ data: { userId: owner, courseId: priv } });
    expect((await readRewardedPrivateCourseAssignment(owner, priv))?.courseId).toBe(priv);
    expect(await readRewardedPrivateCourseAssignment(other, priv)).toBeNull();
    expect(await readRewardedPrivateCourseAssignment(owner, paid)).toBeNull();
    await prisma.courseAccess.delete({ where: { courseId_userId: { courseId: priv, userId: owner } } });
    expect(await readRewardedPrivateCourseAssignment(owner, priv)).toBeNull();
  });

  it("only due and published daily-course video is globally free; owner daily progress is scoped", async () => {
    const at = new Date("2026-11-10T12:00:00.000Z");
    expect((await readPublishedDailyRewardedVideo(sharedVideo, at))?.id).toBe(bundleStep);
    expect(await readPublishedDailyRewardedVideo(sharedVideo, new Date("2026-11-08T12:00:00.000Z"))).toBeNull();
    expect((await readOwnedDailyRewardedUserStep(owner, dailyUserStep))?.bundleStepId).toBe(bundleStep);
    expect(await readOwnedDailyRewardedUserStep(other, dailyUserStep)).toBeNull();
    await prisma.dailyCourseSchedule.update({ where: { id: schedule }, data: { isPublished: false } });
    expect(await readPublishedDailyRewardedVideo(sharedVideo, at)).toBeNull();
  });

  it("video URL remains a projection, not an entitlement: inspect every course occurrence separately", async () => {
    const own = await readOwnedRewardedVideoStep(owner, sharedVideo);
    expect(own?.stepOnDay.id).toBe(paidStepLink);
    expect(await readOwnedRewardedVideoStep("", sharedVideo)).toBeNull();
    const occurrences = await readRewardedCourseVideoOccurrences(sharedVideo);
    expect(occurrences).toHaveLength(2);
    expect(new Set(occurrences.map(row => row.course.id))).toEqual(new Set([paid, priv]));
    expect(occurrences.find(row => row.course.id === priv)?.course.isPrivate).toBe(true);
    expect(await readRewardedCourseVideoOccurrences("")).toEqual([]);
  });

  it("legacy grant is exact actor/type/target and strictly future-expiring; role is read fresh", async () => {
    const at = new Date("2026-11-10T12:00:00.000Z");
    expect((await readRewardedViewerRole(owner))?.role).toBe("USER");
    await prisma.user.update({ where: { id: owner }, data: { role: "TRAINER" } });
    expect((await readRewardedViewerRole(owner))?.role).toBe("TRAINER");
    await prisma.rewardedTargetAccess.create({ data: {
      userId: owner, targetType: "COURSE_STEP", targetId: paidStepLink,
      source: "LEGACY_GAFUS", expiresAt: new Date("2026-11-11T12:00:00.000Z"),
    } });
    expect(await readActiveLegacyRewardedGrant(owner, "COURSE_STEP", paidStepLink, at)).not.toBeNull();
    expect(await readActiveLegacyRewardedGrant(other, "COURSE_STEP", paidStepLink, at)).toBeNull();
    expect(await readActiveLegacyRewardedGrant(owner, "COURSE_STEP", privateStepLink, at)).toBeNull();
    expect(await readActiveLegacyRewardedGrant(owner, "ARTICLE", paidStepLink, at)).toBeNull();
    expect(await readActiveLegacyRewardedGrant(owner, "COURSE_STEP", paidStepLink, new Date("2026-11-11T12:00:00.000Z"))).toBeNull();
  });

  it("step notification is owner-scoped, unsent and ordered newest first", async () => {
    await prisma.stepNotification.createMany({ data: [
      { userId: owner, day: 1, stepIndex: 0, endTs: 1, subscription: {}, url: "/trainings/a/older", sent: false, createdAt: new Date("2026-11-09T08:00:00.000Z") },
      { userId: owner, day: 1, stepIndex: 0, endTs: 1, subscription: {}, url: "/trainings/a/newer", sent: false, createdAt: new Date("2026-11-10T08:00:00.000Z") },
      { userId: owner, day: 1, stepIndex: 0, endTs: 1, subscription: {}, url: "/trainings/a/sent", sent: true, createdAt: new Date("2026-11-11T08:00:00.000Z") },
      { userId: other, day: 1, stepIndex: 0, endTs: 1, subscription: {}, url: "/trainings/a/foreign", sent: false, createdAt: new Date("2026-11-11T09:00:00.000Z") },
    ] });
    expect((await readPendingRewardedStepNotificationUrl(owner, 1, 0))?.url).toBe("/trainings/a/newer");
    expect((await readPendingRewardedStepNotificationUrl(other, 1, 0))?.url).toBe("/trainings/a/foreign");
    expect(await readPendingRewardedStepNotificationUrl(owner, 1, 1)).toBeNull();
  });
});
