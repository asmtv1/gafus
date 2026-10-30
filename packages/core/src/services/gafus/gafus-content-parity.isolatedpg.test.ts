/** Opt-in and hard-gated: test ONLY the temporary fresh local parity database. */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { lockGafusUser } from "./locking";
import { changeGafusBalanceTx, getGafusBalance } from "./walletService";
import { unlockContentWithGafus } from "./accessGrantService";
import {
  hasActiveGafusCourseStepAccess,
  resolveCourseStepAccessTx,
  resolveCourseStepTargetTx,
} from "../contentAccess";
import { resolveArticleEntitlement } from "../contentAccess/policy";
import { requireCourseStepOperationAccess, updateStepAndDay } from "../training/trainingService.ts";
import { requirePremiumOrRewardedAccessForVideoUrl } from "../rewardedCredits/accessService.ts";

const run = process.env.GAFUS_PARITY_ISOLATED_DB === "1" ? describe : describe.skip;
const key = randomBytes(5).toString("hex");
const paidVideoUrl = `https://example.invalid/paid-${key}.mp4`;
const privateVideoUrl = `https://example.invalid/private-course-video-${key}.mp4`;
let viewer = "";
let courseId = "";
let freeCourseId = "";
let freeDayLinkId = "";
let freeStepOccurrence = "";
let dayLinkId = "";
let paidOccurrence = "";
let secondPaidOccurrence = "";
let freeOccurrence = "";
let diaryOccurrence = "";
let articleId = "";
let guideId = "";
let guideDay = "";
let guideOccurrence = "";

run("Isolated PostgreSQL: subscription/Gafus educational parity (never production)", () => {
  beforeAll(async () => {
    const db = new URL(process.env.DATABASE_URL ?? "");
    if (
      !(
        ["localhost", "127.0.0.1"].includes(db.hostname) &&
        db.port === "5432" &&
        [
          "/gafus_refactor_parity_schema_20261027_1643",
          "/gafus_refactor_parity_baseline_20261027_1905",
        ].includes(db.pathname)
      )
    ) {
      throw new Error("REFUSE_NON_ISOLATED_POSTGRES");
    }
    const actor = await prisma.user.create({
      data: {
        username: `parity_author_${key}`,
        password: "!not-login!",
        registrationPending: false,
        role: "TRAINER",
      },
    });
    viewer = (
      await prisma.user.create({
        data: {
          username: `parity_viewer_${key}`,
          password: "!not-login!",
          registrationPending: false,
          role: "USER",
        },
      })
    ).id;
    await prisma.$transaction(async (tx) => {
      await lockGafusUser(tx, viewer);
      await changeGafusBalanceTx(tx, {
        userId: viewer,
        amount: 10,
        kind: "ADMIN_CREDIT",
        idempotencyKey: `parity:${key}:initial-10`,
      });
    });
    const course = await prisma.course.create({
      data: {
        name: "Parity paid course",
        type: `parity_${key}`,
        duration: "7",
        logoImg: "",
        trainingLevel: "BEGINNER",
        authorId: actor.id,
        isPaid: true,
        isPrivate: false,
      },
    });
    courseId = course.id;
    const freeCourse = await prisma.course.create({
      data: {
        name: "Parity free course",
        type: `parity_free_${key}`,
        duration: "7",
        logoImg: "",
        trainingLevel: "BEGINNER",
        authorId: actor.id,
        isPaid: false,
        isPrivate: false,
      },
    });
    freeCourseId = freeCourse.id;
    const freeDay = await prisma.trainingDay.create({
      data: {
        title: "Parity free day",
        authorId: actor.id,
      },
    });
    freeDayLinkId = (
      await prisma.dayOnCourse.create({
        data: {
          courseId: freeCourseId,
          dayId: freeDay.id,
          order: 0,
        },
      })
    ).id;
    const freeTrainingStep = await prisma.step.create({
      data: {
        title: "Free training",
        authorId: actor.id,
        type: "TRAINING",
      },
    });
    freeStepOccurrence = (
      await prisma.stepOnDay.create({
        data: {
          dayId: freeDay.id,
          stepId: freeTrainingStep.id,
          order: 0,
        },
      })
    ).id;
    const day = await prisma.trainingDay.create({
      data: { title: "Parity day", authorId: actor.id },
    });
    dayLinkId = (await prisma.dayOnCourse.create({ data: { courseId, dayId: day.id, order: 0 } }))
      .id;
    const paid = await prisma.step.create({
      data: { title: "Paid A", authorId: actor.id, type: "PRACTICE", videoUrl: paidVideoUrl },
    });
    const second = await prisma.step.create({
      data: { title: "Paid B", authorId: actor.id, type: "THEORY", videoUrl: privateVideoUrl },
    });
    const free = await prisma.step.create({
      data: { title: "Break", authorId: actor.id, type: "BREAK" },
    });
    const diary = await prisma.step.create({
      data: { title: "Diary", authorId: actor.id, type: "DIARY" },
    });
    paidOccurrence = (
      await prisma.stepOnDay.create({ data: { dayId: day.id, stepId: paid.id, order: 0 } })
    ).id;
    secondPaidOccurrence = (
      await prisma.stepOnDay.create({ data: { dayId: day.id, stepId: second.id, order: 1 } })
    ).id;
    freeOccurrence = (
      await prisma.stepOnDay.create({ data: { dayId: day.id, stepId: free.id, order: 2 } })
    ).id;
    diaryOccurrence = (
      await prisma.stepOnDay.create({ data: { dayId: day.id, stepId: diary.id, order: 3 } })
    ).id;
    articleId = (
      await prisma.article.create({
        data: {
          title: "Paid parity article",
          slug: `parity-article-${key}`,
          content: "Paywalled",
          authorId: actor.id,
          visibility: "PAID",
        },
      })
    ).id;
    const guide = await prisma.course.create({
      data: {
        name: "Parity mini guide",
        type: `guide_${key}`,
        duration: "1",
        logoImg: "",
        trainingLevel: "BEGINNER",
        authorId: actor.id,
        isPaid: true,
        guideContent: "Mini guide text",
      },
    });
    guideId = guide.id;
    const miniDay = await prisma.trainingDay.create({
      data: { title: "Mini", authorId: actor.id },
    });
    guideDay = (
      await prisma.dayOnCourse.create({ data: { courseId: guideId, dayId: miniDay.id, order: 0 } })
    ).id;
    const miniStep = await prisma.step.create({
      data: { title: "Mini step", authorId: actor.id, type: "PRACTICE" },
    });
    guideOccurrence = (
      await prisma.stepOnDay.create({ data: { dayId: miniDay.id, stepId: miniStep.id, order: 0 } })
    ).id;
  });

  it("free public course permits full training without Premium or wallet charge", async () => {
    const initial = await getGafusBalance(viewer);
    const access = await requireCourseStepOperationAccess({
      userId: viewer,
      platform: "IOS",
      dayOnCourseId: freeDayLinkId,
      stepIndex: 0,
    });
    expect(access).toMatchObject({ courseId: freeCourseId });
    await updateStepAndDay(viewer, freeDayLinkId, 0, { type: "complete" });
    expect(
      await prisma.userStep.count({
        where: {
          stepOnDayId: freeStepOccurrence,
          status: "COMPLETED",
          userTraining: { userId: viewer },
        },
      }),
    ).toBe(1);
    expect(await getGafusBalance(viewer)).toBe(initial);
  });

  it("spends exactly one Gafus per ordinary step and never unlocks its neighbor", async () => {
    const initial = await getGafusBalance(viewer);
    const first = await unlockContentWithGafus({
      userId: viewer,
      target: { type: "COURSE_STEP", dayOnCourseId: dayLinkId, stepOnDayId: paidOccurrence },
      clientRequestId: `step_${key}_12345678`,
    });
    expect(first).toMatchObject({ spent: 1, balance: initial - 1, replay: false });
    const replay = await unlockContentWithGafus({
      userId: viewer,
      target: { type: "COURSE_STEP", dayOnCourseId: dayLinkId, stepOnDayId: paidOccurrence },
      clientRequestId: `step_${key}_12345678`,
    });
    expect(replay).toMatchObject({ replay: true, balance: first.balance });
    expect(await getGafusBalance(viewer)).toBe(initial - 1);
    expect(
      await hasActiveGafusCourseStepAccess({
        userId: viewer,
        dayOnCourseId: dayLinkId,
        stepOnDayId: paidOccurrence,
      }),
    ).toBe(true);
    expect(
      await hasActiveGafusCourseStepAccess({
        userId: viewer,
        dayOnCourseId: dayLinkId,
        stepOnDayId: secondPaidOccurrence,
      }),
    ).toBe(false);
    // No UserTraining or UserStep has been created yet; MP4 authorization is immediate.
    expect(
      await prisma.userTraining.count({ where: { userId: viewer, dayOnCourseId: dayLinkId } }),
    ).toBe(0);
    const media = await requirePremiumOrRewardedAccessForVideoUrl({
      userId: viewer,
      platform: "WEB_DESKTOP",
      videoUrl: paidVideoUrl,
    });
    expect(media).toMatchObject({
      allowed: true,
      source: "GAFUS",
      target: { targetId: paidOccurrence },
    });
    expect(
      await hasActiveGafusCourseStepAccess({
        userId: viewer,
        dayOnCourseId: dayLinkId,
        stepOnDayId: paidOccurrence,
        now: new Date(Date.now() + 8 * 86400000),
      }),
    ).toBe(false);
  });

  it("lets an unlocked user start a step without pre-created UserTraining", async () => {
    expect(
      await prisma.userTraining.count({ where: { userId: viewer, dayOnCourseId: dayLinkId } }),
    ).toBe(0);
    await requireCourseStepOperationAccess({
      userId: viewer,
      platform: "ANDROID",
      dayOnCourseId: dayLinkId,
      stepIndex: 0,
    });
    await updateStepAndDay(viewer, dayLinkId, 0, { type: "start", remainingSec: 60 });
    expect(
      await prisma.userTraining.count({ where: { userId: viewer, dayOnCourseId: dayLinkId } }),
    ).toBe(1);
    expect(
      await prisma.userStep.count({
        where: { stepOnDayId: paidOccurrence, userTraining: { userId: viewer } },
      }),
    ).toBe(1);
  });

  it("allows saving a free BREAK in the same paid course", async () => {
    await requireCourseStepOperationAccess({
      userId: viewer,
      platform: "IOS",
      dayOnCourseId: dayLinkId,
      stepIndex: 2,
    });
    await updateStepAndDay(viewer, dayLinkId, 2, { type: "complete" });
    expect(
      await prisma.userStep.count({
        where: {
          stepOnDayId: freeOccurrence,
          userTraining: { userId: viewer },
          status: "COMPLETED",
        },
      }),
    ).toBe(1);
    await requireCourseStepOperationAccess({
      userId: viewer,
      platform: "IOS",
      dayOnCourseId: dayLinkId,
      stepIndex: 3,
    });
    await updateStepAndDay(viewer, dayLinkId, 3, { type: "complete" });
    expect(
      await prisma.userStep.count({
        where: {
          stepOnDayId: diaryOccurrence,
          userTraining: { userId: viewer },
          status: "COMPLETED",
        },
      }),
    ).toBe(1);
  });

  it("one Gafus opens the entire mini-guide including its step and progress writes", async () => {
    const balance = await getGafusBalance(viewer);
    const result = await unlockContentWithGafus({
      userId: viewer,
      target: { type: "MINI_GUIDE", courseId: guideId },
      clientRequestId: `guide_${key}_12345678`,
    });
    expect(result).toMatchObject({ spent: 1, balance: balance - 1 });
    expect(
      await hasActiveGafusCourseStepAccess({
        userId: viewer,
        dayOnCourseId: guideDay,
        stepOnDayId: guideOccurrence,
      }),
    ).toBe(true);
    await requireCourseStepOperationAccess({
      userId: viewer,
      platform: "WEB_DESKTOP",
      dayOnCourseId: guideDay,
      stepIndex: 0,
    });
    await updateStepAndDay(viewer, guideDay, 0, { type: "complete" });
    expect(
      await prisma.userStep.count({
        where: {
          stepOnDayId: guideOccurrence,
          userTraining: { userId: viewer },
          status: "COMPLETED",
        },
      }),
    ).toBe(1);
  });

  it("one article costs one Gafus and unlocks reading for 168 hours", async () => {
    expect((await resolveArticleEntitlement(articleId, viewer)).allowed).toBe(false);
    const balance = await getGafusBalance(viewer);
    const result = await unlockContentWithGafus({
      userId: viewer,
      target: { type: "ARTICLE", articleId },
      clientRequestId: `article_${key}_12345678`,
    });
    expect(result).toMatchObject({ spent: 1, balance: balance - 1 });
    const access = await prisma.gafusTargetAccess.findFirst({
      where: { userId: viewer, targetType: "ARTICLE" },
    });
    expect(access).not.toBeNull();
    expect(access!.expiresAt.getTime() - access!.grantedAt.getTime()).toBe(604800000);
    expect((await resolveArticleEntitlement(articleId, viewer)).allowed).toBe(true);
    expect(
      (
        await resolveArticleEntitlement(
          articleId,
          viewer,
          "ANDROID",
          new Date(access!.expiresAt.getTime() + 1000),
        )
      ).allowed,
    ).toBe(false);
  });

  it("premium and Gafus are alternative grounds, private still needs assignment", async () => {
    const policy = await resolveCourseStepTargetTx(prisma, dayLinkId, secondPaidOccurrence);
    expect(policy).not.toBeNull();
    expect((await resolveCourseStepAccessTx(prisma, viewer, policy!)).allowed).toBe(false);
    const now = new Date();
    const subscription = await prisma.appSubscription.create({
      data: {
        userId: viewer,
        provider: "MANUAL",
        planCode: "TWO_WEEKS",
        status: "PENDING",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 86400000),
      },
    });
    // A created but unconfirmed payment/order must never grant Premium.
    expect((await resolveCourseStepAccessTx(prisma, viewer, policy!)).allowed).toBe(false);
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", cancelAtPeriodEnd: true },
    });
    // Cancelling renewal does not revoke the already paid period.
    expect((await resolveCourseStepAccessTx(prisma, viewer, policy!)).allowed).toBe(true);
    const alreadyPremium = await unlockContentWithGafus({
      userId: viewer,
      target: { type: "COURSE_STEP", dayOnCourseId: dayLinkId, stepOnDayId: secondPaidOccurrence },
      clientRequestId: `premium_${key}_12345678`,
    });
    expect(alreadyPremium.spent).toBe(0);
    expect((await resolveArticleEntitlement(articleId, viewer, "IOS", new Date())).allowed).toBe(
      true,
    );
    await prisma.course.update({ where: { id: courseId }, data: { isPrivate: true } });
    expect(
      (await resolveCourseStepAccessTx(prisma, viewer, { ...policy!, isPrivate: true })).allowed,
    ).toBe(false);
    expect(
      await prisma.userStep.count({
        where: { stepOnDayId: secondPaidOccurrence, userTraining: { userId: viewer } },
      }),
    ).toBe(0);
    await expect(
      requirePremiumOrRewardedAccessForVideoUrl({
        userId: viewer,
        platform: "WEB_DESKTOP",
        videoUrl: privateVideoUrl,
      }),
    ).rejects.toThrow();
    await prisma.courseAccess.create({ data: { userId: viewer, courseId } });
    await expect(
      requirePremiumOrRewardedAccessForVideoUrl({
        userId: viewer,
        platform: "WEB_DESKTOP",
        videoUrl: privateVideoUrl,
      }),
    ).resolves.toBeNull();
    expect(
      (await resolveCourseStepAccessTx(prisma, viewer, { ...policy!, isPrivate: true })).allowed,
    ).toBe(true);
    await prisma.courseAccess.delete({ where: { courseId_userId: { courseId, userId: viewer } } });
    expect(
      (await resolveCourseStepAccessTx(prisma, viewer, { ...policy!, isPrivate: true })).allowed,
    ).toBe(false);
    await expect(
      unlockContentWithGafus({
        userId: viewer,
        target: {
          type: "COURSE_STEP",
          dayOnCourseId: dayLinkId,
          stepOnDayId: secondPaidOccurrence,
        },
        clientRequestId: `private_${key}_12345678`,
      }),
    ).rejects.toThrow();
    await prisma.course.update({ where: { id: courseId }, data: { isPrivate: false } });
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: new Date(now.getTime() - 1000) },
    });
    expect((await resolveCourseStepAccessTx(prisma, viewer, policy!)).allowed).toBe(false);
    expect((await resolveArticleEntitlement(articleId, viewer)).allowed).toBe(true);
    expect(
      (
        await resolveCourseStepAccessTx(prisma, viewer, {
          ...policy!,
          stepOnDayId: paidOccurrence,
          targetKey: `course-step:${dayLinkId}:${paidOccurrence}`,
        })
      ).allowed,
    ).toBe(true);
    expect(
      await prisma.userStep.count({
        where: { stepOnDayId: paidOccurrence, userTraining: { userId: viewer } },
      }),
    ).toBe(1);
    // Renewing the subscription must not reset existing progress or Gafus balance.
    const balanceBeforeRenewal = await getGafusBalance(viewer);
    await prisma.appSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        cancelAtPeriodEnd: false,
      },
    });
    expect((await resolveCourseStepAccessTx(prisma, viewer, policy!)).allowed).toBe(true);
    expect(await getGafusBalance(viewer)).toBe(balanceBeforeRenewal);
    expect(
      await prisma.userStep.count({
        where: { stepOnDayId: paidOccurrence, userTraining: { userId: viewer } },
      }),
    ).toBe(1);
  });

  it("parallel unlocks on one target debit exactly once across retries and client IDs", async () => {
    const userId = (await prisma.user.create({
      data: {
        username: `parity_concurrent_same_${key}`,
        password: "!not-login!",
        registrationPending: false,
      },
    })).id;
    await prisma.$transaction(async tx => {
      await lockGafusUser(tx, userId);
      await changeGafusBalanceTx(tx, {
        userId, amount: 2, kind: "ADMIN_CREDIT",
        idempotencyKey: `parity:${key}:concurrent-credit`,
      });
    });
    const target = { type: "COURSE_STEP" as const, dayOnCourseId: dayLinkId, stepOnDayId: paidOccurrence };
    const sameRequestId = `same_${key}_12345678`;
    const attempts = await Promise.all(Array.from({ length: 5 }, (_, index) =>
      unlockContentWithGafus({
        userId, target, clientRequestId: index < 3 ? sameRequestId : `diff_${key}_${index}_12345678`,
      }),
    ));
    // Identical clientRequestId replays retain the original receipt (spent: 1),
    // but only the first response is a new operation; no additional debit occurs.
    expect(attempts.filter(result => result.replay === false)).toHaveLength(1);
    expect(attempts.filter(result => result.replay === true)).toHaveLength(4);
    expect(attempts.every(result => result.accessSource === "GAFUS")).toBe(true);
    expect(await getGafusBalance(userId)).toBe(1);
    const purchases = await prisma.gafusTransaction.findMany({
      where: { userId, kind: "SPEND" },
    });
    expect(purchases).toHaveLength(1);
    expect(await prisma.gafusTargetAccess.count({ where: { userId } })).toBe(1);
  });

  it("parallel purchases of different steps cannot overspend a one-Gafus wallet", async () => {
    const userId = (await prisma.user.create({
      data: {
        username: `parity_concurrent_diff_${key}`,
        password: "!not-login!",
        registrationPending: false,
      },
    })).id;
    await prisma.$transaction(async tx => {
      await lockGafusUser(tx, userId);
      await changeGafusBalanceTx(tx, {
        userId, amount: 1, kind: "ADMIN_CREDIT",
        idempotencyKey: `parity:${key}:one-credit`,
      });
    });
    const stepIds = [paidOccurrence, secondPaidOccurrence];
    const purchases = await Promise.allSettled(stepIds.map((stepId, index) =>
      unlockContentWithGafus({
        userId, target: { type: "COURSE_STEP", dayOnCourseId: dayLinkId, stepOnDayId: stepId },
        clientRequestId: `race_${key}_${index}_12345678`,
      }),
    ));
    expect(purchases.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(purchases.filter(item => item.status === "rejected")).toHaveLength(1);
    expect(await getGafusBalance(userId)).toBe(0);
    expect(await prisma.gafusTransaction.count({ where: { userId, kind: "SPEND" } })).toBe(1);
    expect(await prisma.gafusTargetAccess.count({ where: { userId } })).toBe(1);
  });
});
