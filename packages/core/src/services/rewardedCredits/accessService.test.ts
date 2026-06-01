import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "./errors";

const state = vi.hoisted(() => ({
  hasPremium: false,
  unlocks: new Set<string>(),
  userSteps: new Map<
    string,
    {
      id: string;
      userId: string;
      stepOnDayId: string;
      stepType: string;
      videoUrl?: string | null;
    }
  >(),
  dailyUserSteps: new Map<
    string,
    {
      id: string;
      userId: string;
      scheduleId: string;
      bundleStepId: string;
      stepType: string;
      videoUrl?: string | null;
    }
  >(),
  dayOnCourses: new Map<
    string,
    {
      userId: string;
      stepOnDayIds: string[];
      stepTypes: string[];
    }
  >(),
  notifications: [] as { userId: string; day: number; stepIndex: number; url: string | null; sent: boolean }[],
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedCreditTransaction: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          state.unlocks.has(`${where.userId}:${where.targetType}:${where.targetId}`)
            ? { id: "tx-unlock" }
            : null,
        ),
      ),
    },
    userStep: {
      findFirst: vi.fn(({ where }) => {
        const row =
          [...state.userSteps.values()].find((step) => {
            if (where.id && step.id !== where.id) return false;
            if (where.userTraining?.userId && step.userId !== where.userTraining.userId) return false;
            if (where.stepOnDay?.step?.videoUrl && step.videoUrl !== where.stepOnDay.step.videoUrl) {
              return false;
            }
            return true;
          }) ?? null;
        if (!row) return Promise.resolve(null);
        return Promise.resolve({
          id: row.id,
          stepOnDay: { id: row.stepOnDayId, step: { type: row.stepType, videoUrl: row.videoUrl } },
        });
      }),
    },
    dailyCourseUserStep: {
      findFirst: vi.fn(({ where }) => {
        const row =
          [...state.dailyUserSteps.values()].find((step) => {
            if (where.id && step.id !== where.id) return false;
            if (where.dailyCourseUserTraining?.userId && step.userId !== where.dailyCourseUserTraining.userId) {
              return false;
            }
            if (where.bundleStep?.step?.videoUrl && step.videoUrl !== where.bundleStep.step.videoUrl) {
              return false;
            }
            return true;
          }) ?? null;
        if (!row) return Promise.resolve(null);
        return Promise.resolve({
          id: row.id,
          bundleStepId: row.bundleStepId,
          dailyCourseUserTraining: { scheduleId: row.scheduleId },
          bundleStep: { id: row.bundleStepId, step: { type: row.stepType, videoUrl: row.videoUrl } },
        });
      }),
    },
    dayOnCourse: {
      findFirst: vi.fn(({ where }) => {
        const row = state.dayOnCourses.get(where.id);
        if (!row || row.userId !== where.userTrainings?.some?.userId) return Promise.resolve(null);
        return Promise.resolve({
          day: {
            stepLinks: row.stepOnDayIds.map((id, index) => ({
              id,
              step: { type: row.stepTypes[index] },
            })),
          },
        });
      }),
    },
    stepNotification: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          state.notifications.find(
            (notification) =>
              notification.userId === where.userId &&
              notification.day === where.day &&
              notification.stepIndex === where.stepIndex &&
              notification.sent === where.sent,
          ) ?? null,
        ),
      ),
    },
  },
}));

vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn(() =>
    Promise.resolve({ hasActiveSubscription: state.hasPremium }),
  ),
}));

const spendRewardedCredits = vi.fn(({ userId, target }) => {
  state.unlocks.add(`${userId}:${target.targetType}:${target.targetId}`);
  return Promise.resolve({
    spentCredits: target.cost ?? 1,
    balance: 4,
    pendingRefundCredits: 0,
    skippedDueToPremium: false,
    replay: false,
  });
});

vi.mock("./walletService", () => ({
  spendRewardedCredits: (...args: unknown[]) => spendRewardedCredits(...args),
}));

import {
  buildRewardedSpendIdempotencyKey,
  getPremiumOrRewardedAccess,
  requirePremiumOrRewardedAccessForStepNotification,
  requirePremiumOrRewardedAccessForUserStep,
  requirePremiumOrRewardedAccessForVideoUrl,
  unlockRewardedTarget,
} from "./accessService";

describe("premium or rewarded access", () => {
  beforeEach(() => {
    state.hasPremium = false;
    state.unlocks.clear();
    state.userSteps.clear();
    state.dailyUserSteps.clear();
    state.dayOnCourses.clear();
    state.notifications.length = 0;
    vi.clearAllMocks();
  });

  it("allows active Premium without spending credits", async () => {
    state.hasPremium = true;

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
    expect(spendRewardedCredits).not.toHaveBeenCalled();
  });

  it("allows a child endpoint for an already unlocked regular user step", async () => {
    state.userSteps.set("user-step-1", {
      id: "user-step-1",
      userId: "user-1",
      stepOnDayId: "step-on-day-1",
      stepType: "EXAMINATION",
    });
    state.unlocks.add("user-1:COURSE_STEP:step-on-day-1");

    await expect(
      requirePremiumOrRewardedAccessForUserStep({
        userId: "user-1",
        platform: "WEB_DESKTOP",
        userStepId: "user-step-1",
      }),
    ).resolves.toMatchObject({
      allowed: true,
      source: "REWARDED",
      target: { targetType: "COURSE_STEP", targetId: "step-on-day-1" },
    });
  });

  it("allows a video endpoint for an unlocked daily course user step", async () => {
    state.dailyUserSteps.set("daily-user-step-1", {
      id: "daily-user-step-1",
      userId: "user-1",
      scheduleId: "schedule-1",
      bundleStepId: "bundle-step-1",
      stepType: "TRAINING",
      videoUrl: "https://storage.yandexcloud.net/gafus-media/video.mp4",
    });
    state.unlocks.add("user-1:DAILY_COURSE_STEP:schedule-1:bundle-step-1");

    await expect(
      requirePremiumOrRewardedAccessForVideoUrl({
        userId: "user-1",
        platform: "WEB_DESKTOP",
        videoUrl: "https://storage.yandexcloud.net/gafus-media/video.mp4",
      }),
    ).resolves.toMatchObject({
      allowed: true,
      source: "REWARDED",
      target: { targetType: "DAILY_COURSE_STEP", targetId: "schedule-1:bundle-step-1" },
    });
  });

  it("resolves notification access from the existing notification URL", async () => {
    state.dayOnCourses.set("day-on-course-1", {
      userId: "user-1",
      stepOnDayIds: ["step-on-day-1"],
      stepTypes: ["TRAINING"],
    });
    state.notifications.push({
      userId: "user-1",
      day: 1,
      stepIndex: 0,
      url: "/trainings/basic/day-on-course-1",
      sent: false,
    });
    state.unlocks.add("user-1:COURSE_STEP:step-on-day-1");

    await expect(
      requirePremiumOrRewardedAccessForStepNotification({
        userId: "user-1",
        platform: "WEB_DESKTOP",
        day: 1,
        stepIndex: 0,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      source: "REWARDED",
      target: { targetType: "COURSE_STEP", targetId: "step-on-day-1" },
    });
  });

  it("allows an already rewarded-unlocked target without spending again", async () => {
    state.unlocks.add("user-1:ARTICLE:article-1");

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).resolves.toMatchObject({ allowed: true, source: "REWARDED" });
    expect(spendRewardedCredits).not.toHaveBeenCalled();
  });

  it("throws subscription-or-credits required when locked and caller does not unlock", async () => {
    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("spends once when explicitly unlocking a locked target", async () => {
    const result = await unlockRewardedTarget({
      userId: "user-1",
      platform: "ANDROID",
      target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
    });

    expect(result).toMatchObject({
      targetType: "ARTICLE",
      targetId: "article-1",
      unlocked: true,
      spentCredits: 1,
    });
    expect(spendRewardedCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildRewardedSpendIdempotencyKey("user-1", {
          targetType: "ARTICLE",
          targetId: "article-1",
        }),
      }),
    );
  });
});
