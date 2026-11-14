import { requireRewardedAccessReadPort } from "./rewardedAccessReadPort";
import type { createGafusInteropService } from "./gafusInterop";
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
  const dayOnCourse = await requireRewardedAccessReadPort().readOwnedCourseDayRewardedSteps(input.userId, input.dayOnCourseId);
  const stepLink = dayOnCourse?.day.stepLinks[input.stepIndex];
  if (!stepLink) return undefined;
  return courseStepTarget(stepLink.id, stepLink.step.type);
}

async function resolveTargetForUserStep(input: {
  userId: string;
  userStepId: string;
}): Promise<ResolvedTarget> {
  const userStep = await requireRewardedAccessReadPort().readOwnedRewardedUserStep(input.userId, input.userStepId);
  if (userStep) {
    // Free public course children share /training/day's entitlement, including
    // exam results/submission. A paid step still requires subscription/Gafus;
    // private assignment is not turned into public access.
    const policy = userStep.userTraining.dayOnCourse.course;
    if (policy.isPrivate) {
      // Private course assignment is required even for paid subscribers.
      // Revocation must fence all existing userStep IDs, not only the page GET.
      const assigned = await requireRewardedAccessReadPort().readRewardedPrivateCourseAssignment(input.userId, policy.id);
      if (!assigned) throw new SubscriptionOrCreditsRequiredError();
      return null;
    }
    if (!policy.isPaid) return null;
    return courseStepTarget(userStep.stepOnDay.id, userStep.stepOnDay.step.type);
  }

  const dailyStep = await requireRewardedAccessReadPort().readOwnedDailyRewardedUserStep(input.userId, input.userStepId);
  // Курс дня полностью бесплатный, включая все дочерние действия шага.
  if (dailyStep) return null;
  return undefined;
}

async function resolveTargetForVideoUrl(input: {
  userId: string;
  videoUrl: string;
  now?: Date;
}): Promise<ResolvedTarget> {
  const dailyStep = await requireRewardedAccessReadPort().readPublishedDailyRewardedVideo(input.videoUrl, input.now ?? new Date());
  // Курс дня полностью бесплатный, даже до создания пользовательского прогресса.
  if (dailyStep) return null;

  const userStep = await requireRewardedAccessReadPort().readOwnedRewardedVideoStep(input.userId, input.videoUrl);
  if (userStep) {
    const policy = userStep.userTraining.dayOnCourse.course;
    if (policy.isPrivate) {
      const assignment = await requireRewardedAccessReadPort().readRewardedPrivateCourseAssignment(input.userId, policy.id);
      if (!assignment) throw new SubscriptionOrCreditsRequiredError();
      return null;
    }
    if (!policy.isPaid) return null;
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

  const access = await requireRewardedAccessReadPort().readActiveLegacyRewardedGrant(input.userId, input.target.targetType, input.target.targetId, input.now ?? new Date());
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
  const viewer = await requireRewardedAccessReadPort().readRewardedViewerRole(input.userId);
  if (viewer?.role === "ADMIN" || viewer?.role === "TRAINER") {
    return {
      allowed: true, source: "PREMIUM", skippedDueToPremium: true, target: input.target,
    };
  }

  // Retired: rewarded ads are NOT an entitlement for educational content.
  // Only the occurrence-specific Gafus grant checked by the caller, or
  // an active Premium entitlement, may unlock this target.
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

/** Explicit port required: no implicit server singleton in a Core entitlement decision. */
export function createGafusRewardedAccessService(gafus: Pick<
  ReturnType<typeof createGafusInteropService>,
  "hasGafusUnlockForUserStep" | "findGafusUnlockedStepForVideoUrl"
>) {
  async function requirePremiumOrRewardedAccessForUserStep(input: {
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
  if (target.targetType === "COURSE_STEP" && await gafus.hasGafusUnlockForUserStep(input)) {
    return { allowed: true, source: "GAFUS", skippedDueToPremium: false, target };
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}

async function requirePremiumOrRewardedAccessForVideoUrl(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  videoUrl: string;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto | null> {
  // Check actual occurrence grants before the legacy UserStep-based target
  // lookup: a newly purchased step/guide may have no progress row yet.
  const unlockedStepId = await gafus.findGafusUnlockedStepForVideoUrl(input);
  if (unlockedStepId) {
    return {
      allowed: true, source: "GAFUS", skippedDueToPremium: false,
      target: { targetType: "COURSE_STEP", targetId: unlockedStepId },
    };
  }
  const target = await resolveTargetForVideoUrl(input);
  if (target === null) return null;
  if (target === undefined) {
    // No UserStep exists yet. A known private video must not become public to
    // any Premium user through the legacy "unknown video -> Premium" fallback.
    // The video may belong to more than one course; accept an independently
    // authorized occurrence and reject otherwise.
    const occurrences = await requireRewardedAccessReadPort().readRewardedCourseVideoOccurrences(input.videoUrl);
    if (occurrences.length > 0) {
      for (const occurrence of occurrences) {
        if (occurrence.course.isPrivate) {
          const assignment = await requireRewardedAccessReadPort().readRewardedPrivateCourseAssignment(input.userId, occurrence.course.id);
          if (assignment) return null;
          continue;
        }
        if (!occurrence.course.isPaid) return null;
        const allowed = occurrence.day.stepLinks.some(
          link => !isRewardedMonetizedStepType(link.step.type),
        );
        if (allowed) return null;
        const paidStep = occurrence.day.stepLinks.find(
          link => isRewardedMonetizedStepType(link.step.type),
        );
        if (paidStep) {
          try {
            return await getPremiumOrRewardedAccess({
              userId: input.userId, platform: input.platform,
              target: { targetType: "COURSE_STEP", targetId: paidStep.id }, now: input.now,
            });
          } catch (error) {
            if (!(error instanceof SubscriptionOrCreditsRequiredError)) throw error;
          }
        }
      }
      throw new SubscriptionOrCreditsRequiredError();
    }
    return requirePremiumFallback(input);
  }
  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
    now: input.now,
  });
}

  return {
    requirePremiumOrRewardedAccessForUserStep,
    requirePremiumOrRewardedAccessForVideoUrl,
  };
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
    const notification = await requireRewardedAccessReadPort().readPendingRewardedStepNotificationUrl(input.userId, input.day, input.stepIndex);
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
