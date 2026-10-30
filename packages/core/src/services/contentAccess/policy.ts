import { prisma } from "@gafus/prisma";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";

export type CoursePolicy = { id: string; isPrivate: boolean; isPaid: boolean };
export type ContentAccessDecision = {
  allowed: boolean;
  source: "FREE" | "PRIVATE_ASSIGNMENT" | "SUBSCRIPTION" | "ROLE" | "GATING_DISABLED" | "GAFUS" | "DENIED";
};
const denied: ContentAccessDecision = { allowed: false, source: "DENIED" };

/** Role is read from PostgreSQL; an expired subscription never grants access. */
async function premiumAccess(userId: string, now: Date): Promise<ContentAccessDecision> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return denied;
  if (user.role === "ADMIN" || user.role === "PARTNER" || user.role === "TRAINER")
    return { allowed: true, source: "ROLE" };
  const active = await prisma.appSubscription.findFirst({
    where: {
      userId, status: "ACTIVE",
      OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
    },
    select: { id: true },
  });
  return active ? { allowed: true, source: "SUBSCRIPTION" } : denied;
}

export async function resolveCourseEntitlement(
  course: CoursePolicy | null,
  userId?: string,
  now = new Date(),
): Promise<ContentAccessDecision> {
  if (!course) return denied;
  if (course.isPrivate) {
    if (!userId) return denied;
    const assigned = await prisma.courseAccess.findFirst({
      where: { userId, courseId: course.id }, select: { courseId: true },
    });
    return assigned ? { allowed: true, source: "PRIVATE_ASSIGNMENT" } : denied;
  }
  if (!course.isPaid) return { allowed: true, source: "FREE" };
  if (!await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true))
    return { allowed: true, source: "GATING_DISABLED" };
  if (!userId) return denied;
  return premiumAccess(userId, now);
}

/** Paid article HTML is unlocked by subscription or one article-specific
 * seven-day Gafus entitlement on Web, Android and iOS alike. */
export async function resolveArticleEntitlement(
  articleId: string,
  userId?: string,
  platform?: "ANDROID" | "IOS" | "WEB_DESKTOP" | "WEB_TOUCH",
  now = new Date(),
): Promise<ContentAccessDecision> {
  if (!await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true))
    return { allowed: true, source: "GATING_DISABLED" };
  if (!userId) return denied;
  const premium = await premiumAccess(userId, now);
  if (premium.allowed) return premium;
  if (articleId) {
    const unlocked = await prisma.gafusTargetAccess.findFirst({
      where: {
        userId, targetType: "ARTICLE", targetKey: `article:${articleId}`,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (unlocked) return { allowed: true, source: "GAFUS" };
  }
  return denied;
}
