import { prisma } from "@gafus/prisma";
import type { GafusTx } from "../gafus/types";
import { getAppFeatureFlagEnabled, APP_FEATURE_APP_SUBSCRIPTION_GATING } from "../appFeatureFlags";

const MONETIZED_STEP_TYPES = new Set(["TRAINING", "PRACTICE", "THEORY", "EXAMINATION", "SURVEY"]);

export type CourseStepTarget = {
  type: "COURSE_STEP";
  targetKey: string;
  courseId: string;
  dayOnCourseId: string;
  stepOnDayId: string;
  paidOrPrivate: boolean;
  isPrivate: boolean;
  isPaid: boolean;
  isDailyStep: boolean;
  monetized: boolean;
};
export type MiniGuideTarget = {
  type: "MINI_GUIDE";
  targetKey: string;
  courseId: string;
  paidOrPrivate: boolean;
};
export type ArticleTarget = {
  type: "ARTICLE";
  targetKey: string;
  articleId: string;
  courseId: null;
};

export async function resolveArticleTargetTx(tx: GafusTx, articleId: string): Promise<ArticleTarget | null> {
  const article = await tx.article.findUnique({ where: { id: articleId }, select: { id: true } });
  return article ? { type: "ARTICLE", targetKey: `article:${article.id}`, articleId: article.id, courseId: null } : null;
}

export async function resolveArticleAccessTx(tx: GafusTx, userId: string, target: ArticleTarget, now = new Date()): Promise<ContentEntitlement> {
  if (!await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true))
    return { allowed: true, source: "GATING_DISABLED", expiresAt: null, eligibleForGafus: false };
  if (await hasPremiumTx(tx, userId, now, true))
    return { allowed: true, source: "PREMIUM", expiresAt: null, eligibleForGafus: false };
  const access = await tx.gafusTargetAccess.findFirst({
    where: { userId, targetType: "ARTICLE", targetKey: target.targetKey, expiresAt: { gt: now } },
    select: { expiresAt: true }, orderBy: { expiresAt: "desc" },
  });
  return access ? { allowed: true, source: "GAFUS", expiresAt: access.expiresAt, eligibleForGafus: false }
    : { allowed: false, source: "DENIED", expiresAt: null, eligibleForGafus: true };
}
export type ContentEntitlementSource =
  | "GATING_DISABLED" | "DAILY_FREE" | "COURSE_ACCESS" | "PREMIUM"
  | "GAFUS" | "DENIED";
export type ContentEntitlement = {
  allowed: boolean;
  source: ContentEntitlementSource;
  expiresAt: Date | null;
  eligibleForGafus: boolean;
};

export async function resolveCourseStepTargetTx(
  tx: GafusTx, dayOnCourseId: string, stepOnDayId: string,
): Promise<CourseStepTarget | null> {
  const [day, step] = await Promise.all([
    tx.dayOnCourse.findUnique({
      where: { id: dayOnCourseId },
      select: {
        courseId: true, dayId: true,
        course: { select: { isPaid: true, isPrivate: true } },
      },
    }),
    tx.stepOnDay.findUnique({
      where: { id: stepOnDayId },
      select: { dayId: true, step: { select: { type: true, isDailyCourse: true } } },
    }),
  ]);
  if (!day || !step || day.dayId !== step.dayId) return null;
  return {
    type: "COURSE_STEP", dayOnCourseId, stepOnDayId,
    courseId: day.courseId,
    targetKey: `course-step:${dayOnCourseId}:${stepOnDayId}`,
    paidOrPrivate: day.course.isPaid || day.course.isPrivate,
    isPrivate: day.course.isPrivate,
    isPaid: day.course.isPaid,
    monetized: MONETIZED_STEP_TYPES.has(step.step.type),
    isDailyStep: step.step.isDailyCourse,
  };
}

export async function resolveMiniGuideTargetTx(
  tx: GafusTx, courseId: string,
): Promise<MiniGuideTarget | null> {
  const course = await tx.course.findFirst({
    where: { id: courseId, guideContent: { not: "" } },
    select: { isPaid: true, isPrivate: true, id: true },
  });
  if (!course) return null;
  return {
    type: "MINI_GUIDE", targetKey: `mini-guide:${courseId}`, courseId,
    paidOrPrivate: course.isPaid || course.isPrivate,
  };
}

async function hasPremiumTx(
  tx: GafusTx, userId: string, now: Date, isRegularCourseStep: boolean,
): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  // Keep mini-guide role handling unchanged; ordinary course steps follow the
  // same ADMIN/TRAINER/PARTNER exception as the course-level policy.
  if (user?.role === "PARTNER" ||
    (isRegularCourseStep && (user?.role === "ADMIN" || user?.role === "TRAINER"))) return true;
  const subscription = await tx.appSubscription.findFirst({
    where: {
      userId, status: "ACTIVE",
      OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
    },
    select: { id: true },
  });
  return !!subscription;
}

async function resolveEntitlementTx(
  tx: GafusTx,
  userId: string,
  target: CourseStepTarget | MiniGuideTarget,
  now: Date,
): Promise<ContentEntitlement> {
  if (target.type === "MINI_GUIDE") {
    // Preserve the pre-refactor mini-guide algorithm verbatim.
    const explicit = await tx.courseAccess.findFirst({
      where: { courseId: target.courseId, userId }, select: { courseId: true },
    });
    if (explicit) return { allowed: true, source: "COURSE_ACCESS", expiresAt: null, eligibleForGafus: false };
    if (target.paidOrPrivate) {
      return { allowed: false, source: "DENIED", expiresAt: null, eligibleForGafus: false };
    }
  } else {
    // A private course requires assignment regardless of subscription or ads.
    if (target.isPrivate) {
      const assigned = await tx.courseAccess.findFirst({
        where: { courseId: target.courseId, userId }, select: { courseId: true },
      });
      return assigned
        ? { allowed: true, source: "COURSE_ACCESS", expiresAt: null, eligibleForGafus: false }
        : { allowed: false, source: "DENIED", expiresAt: null, eligibleForGafus: false };
    }
    // Public course outlines remain free; step contents require entitlement
    // independently of the legacy course purchase flag.
  }
  if (!await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true)) {
    return { allowed: true, source: "GATING_DISABLED", expiresAt: null, eligibleForGafus: false };
  }
  if (await hasPremiumTx(tx, userId, now, target.type === "COURSE_STEP")) {
    return { allowed: true, source: "PREMIUM", expiresAt: null, eligibleForGafus: false };
  }
  const access = await tx.gafusTargetAccess.findFirst({
    where: { userId, targetType: target.type, targetKey: target.targetKey, expiresAt: { gt: now } },
    select: { expiresAt: true },
    orderBy: { expiresAt: "desc" },
  });
  if (access) return {
    allowed: true, source: "GAFUS", expiresAt: access.expiresAt,
    eligibleForGafus: false,
  };
  return { allowed: false, source: "DENIED", expiresAt: null, eligibleForGafus: true };
}

export async function resolveCourseStepAccessTx(
  tx: GafusTx, userId: string, target: CourseStepTarget, now = new Date(),
) {
  return resolveEntitlementTx(tx, userId, target, now);
}

export async function resolveMiniGuideAccessTx(
  tx: GafusTx, userId: string, target: MiniGuideTarget, now = new Date(),
) {
  return resolveEntitlementTx(tx, userId, target, now);
}

/** Course-occurrence-specific access. Never grant based on stepOnDayId alone. */
export async function hasActiveGafusCourseStepAccess(input: {
  userId: string;
  dayOnCourseId: string;
  stepOnDayId: string;
  now?: Date;
}): Promise<boolean> {
  const target = await resolveCourseStepTargetTx(prisma, input.dayOnCourseId, input.stepOnDayId);
  if (!target || target.isPrivate || !target.monetized) return false;
  const access = await prisma.gafusTargetAccess.findFirst({
    where: {
      userId: input.userId,
      targetType: "COURSE_STEP",
      targetKey: target.targetKey,
      expiresAt: { gt: input.now ?? new Date() },
    },
    select: { id: true },
  });
  return Boolean(access);
}
