import { prisma } from "@gafus/prisma";
import { hasGafusUnlockForUserStep, hasGafusUnlockForVideoUrl } from "./gafusInterop";
import { hasActiveGafusCourseStepAccess } from "../contentAccess";

import { SubscriptionOrCreditsRequiredError } from "./errors";
import type {
  MonetizedAccessPlatform,
  PremiumOrRewardedAccessDto,
  RewardedTargetInput,
} from "./types";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";
import { getAppSubscriptionAccess } from "../appSubscription";

const REWARDED_MONETIZED_STEP_TYPES = new Set([
  "TRAINING",
  "PRACTICE",
  "THEORY",
  "EXAMINATION",
  "SURVEY",
]);

function isRewardedMonetizedStepType(stepType: string | null | undefined): boolean {
  return REWARDED_MONETIZED_STEP_TYPES.has(stepType ?? "");
}

function courseStepTarget(
  stepOnDayId: string,
  stepType: string | null | undefined,
): RewardedTargetInput | null {
  if (!isRewardedMonetizedStepType(stepType)) return null;
  return {
    targetType: "COURSE_STEP",
    targetId: stepOnDayId,
  };
}

type ResolvedTarget = RewardedTargetInput | null | undefined;

async function requirePremiumFallback(input: { userId: string; now?: Date }): Promise<null> {
  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true);
  if (!gatingEnabled) return null;

  const subscription = await getAppSubscriptionAccess(input.userId, input.now);
  if (subscription.hasActiveSubscription) return null;

  throw new SubscriptionOrCreditsRequiredError();
}

function parseDayOnCourseIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const pathname = (() => {
    try {
      return new URL(url, "https://gafus.local").pathname;
    } catch {
      return url;
    }
  })();
  const match = pathname.match(/^\/trainings\/[^/]+\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function resolveRegularCourseTargetByDayOnCourseAndStep(input: {
  userId: string;
  dayOnCourseId: string;
  stepIndex: number;
}): Promise<ResolvedTarget> {
  const dayOnCourse = await prisma.dayOnCourse.findFirst({
    where: {
      id: input.dayOnCourseId,
      userTrainings: { some: { userId: input.userId } },
    },
    select: {
      course: { select: { isPaid: true, isPrivate: true } },
      day: {
        select: {
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              step: { select: { type: true } },
            },
          },
        },
      },
    },
  });
  if (dayOnCourse?.course && !dayOnCourse.course.isPaid && !dayOnCourse.course.isPrivate) return null;
  const stepLink = dayOnCourse?.day.stepLinks[input.stepIndex];
  if (!stepLink) return undefined;
  return courseStepTarget(stepLink.id, stepLink.step.type);
}

async function resolveTargetForUserStep(input: {
  userId: string;
  userStepId: string;
}): Promise<ResolvedTarget> {
  const userStep = await prisma.userStep.findFirst({
    where: {
      id: input.userStepId,
      userTraining: { userId: input.userId },
    },
    select: {
      userTraining: { select: { dayOnCourse: { select: { course: { select: { isPaid: true, isPrivate: true } } } } } },
      stepOnDay: {
        select: {
          id: true,
          step: { select: { type: true } },
        },
      },
    },
  });
  if (userStep) {
    const course = userStep.userTraining?.dayOnCourse?.course;
    if (course && !course.isPaid && !course.isPrivate) return null;
    return courseStepTarget(userStep.stepOnDay.id, userStep.stepOnDay.step.type);
  }

  const dailyStep = await prisma.dailyCourseUserStep.findFirst({
    where: {
      id: input.userStepId,
      dailyCourseUserTraining: { userId: input.userId },
    },
    select: {
      bundleStepId: true,
      dailyCourseUserTraining: { select: { scheduleId: true } },
      bundleStep: { select: { step: { select: { type: true } } } },
    },
  });
  // Курс дня полностью бесплатный, включая все дочерние действия шага.
  if (dailyStep) return null;
  return undefined;
}

async function resolveTargetForVideoUrl(input: {
  userId: string;
  videoUrl: string;
  now?: Date;
}): Promise<ResolvedTarget> {
  const dailyStep = await prisma.dailyCourseBundleStep.findFirst({
    where: {
      step: { videoUrl: input.videoUrl },
      bundle: {
        schedules: {
          some: {
            isPublished: true,
            date: { lte: input.now ?? new Date() },
          },
        },
      },
    },
    select: { id: true },
  });
  // Курс дня полностью бесплатный, даже до создания пользовательского прогресса.
  if (dailyStep) return null;

  const userStep = await prisma.userStep.findFirst({
    where: {
      userTraining: { userId: input.userId },
      stepOnDay: { step: { videoUrl: input.videoUrl } },
    },
    select: {
      userTraining: { select: { dayOnCourse: { select: { course: { select: { isPaid: true, isPrivate: true } } } } } },
      stepOnDay: {
        select: {
          id: true,
          step: { select: { type: true } },
        },
      },
    },
  });
  if (userStep) {
    const course = userStep.userTraining?.dayOnCourse?.course;
    if (course && !course.isPaid && !course.isPrivate) return null;
    return courseStepTarget(userStep.stepOnDay.id, userStep.stepOnDay.step.type);
  }

  return undefined;
}

export async function hasRewardedTargetUnlock(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<boolean> {
  if (input.platform !== "ANDROID" && input.platform !== "IOS") return false;
  if (input.target.targetType !== "ARTICLE" && input.target.targetType !== "COURSE_STEP") {
    return false;
  }

  const access = await prisma.rewardedTargetAccess.findFirst({
    where: {
      userId: input.userId,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      expiresAt: { gt: input.now ?? new Date() },
    },
    select: { id: true },
  });
  return Boolean(access);
}

export async function getPremiumOrRewardedAccess(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true);
  if (!gatingEnabled) {
    return {
      allowed: true,
      source: "GATING_DISABLED",
      skippedDueToPremium: false,
      target: input.target,
    };
  }

  const subscription = await getAppSubscriptionAccess(input.userId, input.now);
  if (subscription.hasActiveSubscription) {
    return {
      allowed: true,
      source: "PREMIUM",
      skippedDueToPremium: true,
      target: input.target,
    };
  }

  // Ordinary paid articles/course steps are open to admins and trainers as
  // established by contentAccess/policy.ts. Keep subscription plan entitlements
  // for cynologist chat and bookings unchanged.
  const viewer = await prisma.user.findUnique({
    where: { id: input.userId }, select: { role: true },
  });
  if (viewer?.role === "ADMIN" || viewer?.role === "TRAINER" || viewer?.role === "PARTNER") {
    return {
      allowed: true, source: "PREMIUM", skippedDueToPremium: true, target: input.target,
    };
  }

  if (
    await hasRewardedTargetUnlock({
      userId: input.userId,
      platform: input.platform,
      target: input.target,
      now: input.now,
    })
  ) {
    return {
      allowed: true,
      source: "REWARDED",
      skippedDueToPremium: false,
      target: input.target,
    };
  }

  throw new SubscriptionOrCreditsRequiredError();
}

export async function requirePremiumOrRewardedUnlock(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  return getPremiumOrRewardedAccess(input);
}

export async function requirePremiumOrRewardedAccessForUserStep(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  userStepId: string;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  const target = await resolveTargetForUserStep(input);
  if (target === null) return null;
  if (target === undefined) {
    return requirePremiumFallback(input);
  }
  if (target.targetType === "COURSE_STEP" && await hasGafusUnlockForUserStep(input)) {
    return { allowed: true, source: "GAFUS", skippedDueToPremium: false, target };
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}

export async function requirePremiumOrRewardedAccessForVideoUrl(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  videoUrl: string;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  const target = await resolveTargetForVideoUrl(input);
  if (target === null) return null;
  if (target === undefined) {
    return requirePremiumFallback(input);
  }
  if (target.targetType === "COURSE_STEP" && await hasGafusUnlockForVideoUrl(input)) {
    return { allowed: true, source: "GAFUS", skippedDueToPremium: false, target };
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}

export async function requirePremiumOrRewardedAccessForStepNotification(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  day: number;
  stepIndex: number;
  dayOnCourseId?: string | null;
  maybeUrl?: string | null;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  let dayOnCourseId = input.dayOnCourseId ?? parseDayOnCourseIdFromUrl(input.maybeUrl);
  if (!dayOnCourseId) {
    const notification = await prisma.stepNotification.findFirst({
      where: {
        userId: input.userId,
        day: input.day,
        stepIndex: input.stepIndex,
        sent: false,
      },
      orderBy: { createdAt: "desc" },
      select: { url: true },
    });
    dayOnCourseId = parseDayOnCourseIdFromUrl(notification?.url);
  }

  if (!dayOnCourseId) {
    return requirePremiumFallback(input);
  }

  const target = await resolveRegularCourseTargetByDayOnCourseAndStep({
    userId: input.userId,
    dayOnCourseId,
    stepIndex: input.stepIndex,
  });
  if (target === null) return null;
  if (target === undefined) {
    return requirePremiumFallback(input);
  }
  if (target.targetType === "COURSE_STEP" &&
    await hasActiveGafusCourseStepAccess({
      userId: input.userId, dayOnCourseId,
      stepOnDayId: target.targetId, now: input.now,
    })) {
    return { allowed: true, source: "GAFUS", skippedDueToPremium: false, target };
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}
