import { prisma } from "@gafus/prisma";

import { SubscriptionOrCreditsRequiredError } from "./errors";
import type {
  PremiumOrRewardedAccessDto,
  RewardedPlatform,
  RewardedTargetInput,
  RewardedUnlockResultDto,
} from "./types";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";
import { getAppSubscriptionAccess } from "../appSubscription";
import { spendRewardedCredits } from "./walletService";
import { REWARDED_STEP_UNLOCK_COST } from "./constants";

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

function courseStepTarget(stepOnDayId: string, stepType: string | null | undefined): RewardedTargetInput | null {
  if (!isRewardedMonetizedStepType(stepType)) return null;
  return {
    targetType: "COURSE_STEP",
    targetId: stepOnDayId,
    cost: REWARDED_STEP_UNLOCK_COST,
  };
}

function dailyCourseStepTarget(input: {
  scheduleId: string;
  bundleStepId: string;
  stepType: string | null | undefined;
}): RewardedTargetInput | null {
  if (!isRewardedMonetizedStepType(input.stepType)) return null;
  return {
    targetType: "DAILY_COURSE_STEP",
    targetId: `${input.scheduleId}:${input.bundleStepId}`,
    cost: REWARDED_STEP_UNLOCK_COST,
  };
}

async function requirePremiumFallback(input: {
  userId: string;
  now?: Date;
}): Promise<null> {
  const gatingEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );
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
}): Promise<RewardedTargetInput | null> {
  const dayOnCourse = await prisma.dayOnCourse.findFirst({
    where: {
      id: input.dayOnCourseId,
      userTrainings: { some: { userId: input.userId } },
    },
    select: {
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
  const stepLink = dayOnCourse?.day.stepLinks[input.stepIndex];
  if (!stepLink) return null;
  return courseStepTarget(stepLink.id, stepLink.step.type);
}

async function resolveTargetForUserStep(input: {
  userId: string;
  userStepId: string;
}): Promise<RewardedTargetInput | null> {
  const userStep = await prisma.userStep.findFirst({
    where: {
      id: input.userStepId,
      userTraining: { userId: input.userId },
    },
    select: {
      stepOnDay: {
        select: {
          id: true,
          step: { select: { type: true } },
        },
      },
    },
  });
  if (userStep) {
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
  if (!dailyStep) return null;
  return dailyCourseStepTarget({
    scheduleId: dailyStep.dailyCourseUserTraining.scheduleId,
    bundleStepId: dailyStep.bundleStepId,
    stepType: dailyStep.bundleStep.step.type,
  });
}

async function resolveTargetForVideoUrl(input: {
  userId: string;
  videoUrl: string;
}): Promise<RewardedTargetInput | null> {
  const userStep = await prisma.userStep.findFirst({
    where: {
      userTraining: { userId: input.userId },
      stepOnDay: { step: { videoUrl: input.videoUrl } },
    },
    select: {
      stepOnDay: {
        select: {
          id: true,
          step: { select: { type: true } },
        },
      },
    },
  });
  if (userStep) {
    return courseStepTarget(userStep.stepOnDay.id, userStep.stepOnDay.step.type);
  }

  const dailyStep = await prisma.dailyCourseUserStep.findFirst({
    where: {
      dailyCourseUserTraining: { userId: input.userId },
      bundleStep: { step: { videoUrl: input.videoUrl } },
    },
    select: {
      bundleStepId: true,
      dailyCourseUserTraining: { select: { scheduleId: true } },
      bundleStep: { select: { step: { select: { type: true } } } },
    },
  });
  if (!dailyStep) return null;
  return dailyCourseStepTarget({
    scheduleId: dailyStep.dailyCourseUserTraining.scheduleId,
    bundleStepId: dailyStep.bundleStepId,
    stepType: dailyStep.bundleStep.step.type,
  });
}

export function buildRewardedSpendIdempotencyKey(
  userId: string,
  target: Pick<RewardedTargetInput, "targetType" | "targetId">,
): string {
  return `rewarded:spend:${userId}:${target.targetType}:${target.targetId}`;
}

export async function hasRewardedTargetUnlock(input: {
  userId: string;
  target: RewardedTargetInput;
}): Promise<boolean> {
  const transaction = await prisma.rewardedCreditTransaction.findFirst({
    where: {
      userId: input.userId,
      type: "SPEND",
      targetType: input.target.targetType,
      targetId: input.target.targetId,
    },
    select: { id: true },
  });
  return Boolean(transaction);
}

export async function getPremiumOrRewardedAccess(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  const gatingEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );
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

  if (await hasRewardedTargetUnlock({ userId: input.userId, target: input.target })) {
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
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  return getPremiumOrRewardedAccess(input);
}

export async function unlockRewardedTarget(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<RewardedUnlockResultDto> {
  try {
    const access = await getPremiumOrRewardedAccess(input);
    return {
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      unlocked: true,
      spentCredits: 0,
      balance: 0,
      pendingRefundCredits: 0,
    };
  } catch (error) {
    if (!(error instanceof SubscriptionOrCreditsRequiredError)) {
      throw error;
    }
  }

  const cost = input.target.cost ?? 1;
  const spend = await spendRewardedCredits({
    userId: input.userId,
    target: input.target,
    amount: cost,
    idempotencyKey: buildRewardedSpendIdempotencyKey(input.userId, input.target),
    now: input.now,
  });

  return {
    targetType: input.target.targetType,
    targetId: input.target.targetId,
    unlocked: true,
    spentCredits: spend.spentCredits,
    balance: spend.balance,
    pendingRefundCredits: spend.pendingRefundCredits,
  };
}

export async function requirePremiumOrRewardedAccessForUserStep(input: {
  userId: string;
  platform: RewardedPlatform;
  userStepId: string;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  const target = await resolveTargetForUserStep(input);
  if (!target) {
    return requirePremiumFallback(input);
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
  platform: RewardedPlatform;
  videoUrl: string;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  const target = await resolveTargetForVideoUrl(input);
  if (!target) {
    return requirePremiumFallback(input);
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
  platform: RewardedPlatform;
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
  if (!target) {
    return requirePremiumFallback(input);
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}
