import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "./errors";

const state = vi.hoisted(() => ({
  hasPremium: false,
  role: "USER",
  gafusUnlocked: false,
  courseIsPaid: true,
  unlocks: new Map<string, Date>(),
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
  notifications: [] as {
    userId: string;
    day: number;
    stepIndex: number;
    url: string | null;
    sent: boolean;
  }[],
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(() => Promise.resolve({ role: state.role })),
    },
    rewardedTargetAccess: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          (() => {
            const expiresAt = state.unlocks.get(
              `${where.userId}:${where.targetType}:${where.targetId}`,
            );
            return expiresAt && expiresAt > where.expiresAt.gt ? { id: "target-access" } : null;
          })(),
        ),
      ),
    },
    userStep: {
      findFirst: vi.fn(({ where }) => {
        const row =
          [...state.userSteps.values()].find((step) => {
            if (where.id && step.id !== where.id) return false;
            if (where.userTraining?.userId && step.userId !== where.userTraining.userId)
              return false;
            if (
              where.stepOnDay?.step?.videoUrl &&
              step.videoUrl !== where.stepOnDay.step.videoUrl
            ) {
              return false;
            }
            return true;
          }) ?? null;
        if (!row) return Promise.resolve(null);
        return Promise.resolve({
          id: row.id,
          userTraining: { dayOnCourse: { course: { isPaid: state.courseIsPaid, isPrivate: false } } },
          stepOnDay: { id: row.stepOnDayId, step: { type: row.stepType, videoUrl: row.videoUrl } },
        });
      }),
    },
    dailyCourseUserStep: {
      findFirst: vi.fn(({ where }) => {
        const row =
          [...state.dailyUserSteps.values()].find((step) => {
            if (where.id && step.id !== where.id) return false;
            if (
              where.dailyCourseUserTraining?.userId &&
              step.userId !== where.dailyCourseUserTraining.userId
            ) {
              return false;
            }
            if (
              where.bundleStep?.step?.videoUrl &&
              step.videoUrl !== where.bundleStep.step.videoUrl
            ) {
              return false;
            }
            return true;
          }) ?? null;
        if (!row) return Promise.resolve(null);
        return Promise.resolve({
          id: row.id,
          bundleStepId: row.bundleStepId,
          dailyCourseUserTraining: { scheduleId: row.scheduleId },
          bundleStep: {
            id: row.bundleStepId,
            step: { type: row.stepType, videoUrl: row.videoUrl },
          },
        });
      }),
    },
    dailyCourseBundleStep: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          [...state.dailyUserSteps.values()].some((step) => step.videoUrl === where.step?.videoUrl)
            ? { id: "daily-bundle-step" }
            : null,
        ),
      ),
    },
    dayOnCourse: {
      findFirst: vi.fn(({ where }) => {
        const row = state.dayOnCourses.get(where.id);
        if (!row || row.userId !== where.userTrainings?.some?.userId) return Promise.resolve(null);
        return Promise.resolve({
          course: { isPaid: state.courseIsPaid, isPrivate: false },
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

vi.mock("../contentAccess", () => ({
  hasActiveGafusCourseStepAccess: vi.fn(async () => state.gafusUnlocked),
}));
vi.mock("./gafusInterop", () => ({
  hasGafusUnlockForUserStep: vi.fn(async () => state.gafusUnlocked),
  hasGafusUnlockForVideoUrl: vi.fn(async () => state.gafusUnlocked),
}));

import {
  getPremiumOrRewardedAccess,
  requirePremiumOrRewardedAccessForStepNotification,
  requirePremiumOrRewardedAccessForUserStep,
  requirePremiumOrRewardedAccessForVideoUrl,
} from "./accessService";

describe("premium or rewarded access", () => {
  beforeEach(() => {
    state.hasPremium = false;
    state.role = "USER";
    state.gafusUnlocked = false;
    state.courseIsPaid = true;
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
        target: { targetType: "ARTICLE", targetId: "article-1" },
      }),
    ).resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
  });

  it("Full Access course exams and videos remain free without Premium or Gafus", async () => {
    state.courseIsPaid = false;
    state.userSteps.set("free-step", {
      id: "free-step", userId: "user-1", stepOnDayId: "free-link", stepType: "EXAMINATION", videoUrl: "https://example.test/free-video",
    });
    expect(await requirePremiumOrRewardedAccessForUserStep({ userId: "user-1", platform: "IOS", userStepId: "free-step" })).toBeNull();
    expect(await requirePremiumOrRewardedAccessForVideoUrl({ userId: "user-1", platform: "ANDROID", videoUrl: "https://example.test/free-video" })).toBeNull();
  });

  it("allows admin/trainer course-step and article gates without changing subscription plans", async () => {
    for (const role of ["ADMIN", "TRAINER"]) {
      state.role = role;
      await expect(getPremiumOrRewardedAccess({
        userId: "user-1", platform: "WEB_DESKTOP",
        target: { targetType: "COURSE_STEP", targetId: "step-1" },
      })).resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
      await expect(getPremiumOrRewardedAccess({
        userId: "user-1", platform: "WEB_DESKTOP",
        target: { targetType: "ARTICLE", targetId: "article-1" },
      })).resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
    }
  });

  it("allows a child endpoint for an already unlocked regular user step", async () => {
    state.userSteps.set("user-step-1", {
      id: "user-step-1",
      userId: "user-1",
      stepOnDayId: "step-on-day-1",
      stepType: "EXAMINATION",
    });
    state.unlocks.set("user-1:COURSE_STEP:step-on-day-1", new Date("2026-08-12T00:00:00Z"));

    await expect(
      requirePremiumOrRewardedAccessForUserStep({
        userId: "user-1",
        platform: "ANDROID",
        userStepId: "user-step-1",
        now: new Date("2026-08-11T00:00:00Z"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      source: "REWARDED",
      target: { targetType: "COURSE_STEP", targetId: "step-on-day-1" },
    });
  });

  it("accepts a Gafus-unlocked exam step without a subscription or ad credits", async () => {
    state.gafusUnlocked = true;
    state.userSteps.set("user-step-gafus", {
      id: "user-step-gafus",
      userId: "user-1",
      stepOnDayId: "step-on-day-gafus",
      stepType: "EXAMINATION",
    });
    await expect(requirePremiumOrRewardedAccessForUserStep({
      userId: "user-1",
      platform: "WEB_DESKTOP",
      userStepId: "user-step-gafus",
    })).resolves.toMatchObject({
      allowed: true,
      source: "GAFUS",
      target: { targetType: "COURSE_STEP", targetId: "step-on-day-gafus" },
    });
  });

  it("allows a video endpoint for a daily course user step without subscription", async () => {
    state.dailyUserSteps.set("daily-user-step-1", {
      id: "daily-user-step-1",
      userId: "user-1",
      scheduleId: "schedule-1",
      bundleStepId: "bundle-step-1",
      stepType: "TRAINING",
      videoUrl: "https://storage.yandexcloud.net/gafus-media/video.mp4",
    });
    await expect(
      requirePremiumOrRewardedAccessForVideoUrl({
        userId: "user-1",
        platform: "WEB_DESKTOP",
        videoUrl: "https://storage.yandexcloud.net/gafus-media/video.mp4",
      }),
    ).resolves.toBeNull();
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
    state.unlocks.set("user-1:COURSE_STEP:step-on-day-1", new Date("2026-08-12T00:00:00Z"));

    await expect(
      requirePremiumOrRewardedAccessForStepNotification({
        userId: "user-1",
        platform: "IOS",
        day: 1,
        stepIndex: 0,
        now: new Date("2026-08-11T00:00:00Z"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      source: "REWARDED",
      target: { targetType: "COURSE_STEP", targetId: "step-on-day-1" },
    });
  });

  it("allows an already rewarded-unlocked target without spending again", async () => {
    state.unlocks.set("user-1:ARTICLE:article-1", new Date("2026-08-12T00:00:00Z"));

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1" },
        now: new Date("2026-08-11T00:00:00Z"),
      }),
    ).resolves.toMatchObject({ allowed: true, source: "REWARDED" });
  });

  it("does not accept rewarded access on web", async () => {
    state.unlocks.set("user-1:ARTICLE:article-1", new Date("2026-08-12T00:00:00Z"));

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "WEB_DESKTOP",
        target: { targetType: "ARTICLE", targetId: "article-1" },
        now: new Date("2026-08-11T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("does not accept an expired rewarded access", async () => {
    state.unlocks.set("user-1:ARTICLE:article-1", new Date("2026-08-11T00:00:00Z"));

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "IOS",
        target: { targetType: "ARTICLE", targetId: "article-1" },
        now: new Date("2026-08-11T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("throws subscription-or-credits required when locked and caller does not unlock", async () => {
    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1" },
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });
});
