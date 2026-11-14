/** Core remains authoritative on access policy; all owner-scoped DB reads
 * are supplied at Application composition, not imported from Persistence.
 * No adapter means an error, never a fabricated successful entitlement.
 */
export interface ContentPolicyReadPort {
  readAccessActorRole(userId: string): Promise<string | null>;
  hasCurrentPaidSubscription(userId: string, now: Date): Promise<boolean>;
  hasAssignedPrivateCourse(userId: string, courseId: string): Promise<boolean>;
  hasActiveGafusArticleAccess(userId: string, articleId: string, now: Date): Promise<boolean>;
}
let contentPolicyReader: Readonly<ContentPolicyReadPort> | null = null;
export function registerContentPolicyReadPort(port: ContentPolicyReadPort): void {
  if (contentPolicyReader !== null && contentPolicyReader !== port) {
    throw new Error("CONTENT_POLICY_READ_PORT_ALREADY_BOUND");
  }
  contentPolicyReader = port;
}
function requireContentPolicyReadPort(): Readonly<ContentPolicyReadPort> {
  if (!contentPolicyReader) throw new Error("CONTENT_POLICY_READ_PORT_UNBOUND");
  return contentPolicyReader;
}
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";

export type CoursePolicy = { id: string; isPrivate: boolean; isPaid: boolean };
export type ContentAccessDecision = {
  allowed: boolean;
  source: "FREE" | "PRIVATE_ASSIGNMENT" | "SUBSCRIPTION" | "ROLE" | "GATING_DISABLED" | "GAFUS" | "DENIED";
};
const denied: ContentAccessDecision = { allowed: false, source: "DENIED" };

/** Role is read from PostgreSQL; an expired subscription never grants access. */
async function premiumAccess(userId: string, now: Date): Promise<ContentAccessDecision> {
  const role = await requireContentPolicyReadPort().readAccessActorRole(userId);
  if (!role) return denied;
  if (role === "ADMIN" || role === "PARTNER" || role === "TRAINER")
    return { allowed: true, source: "ROLE" };
  return await requireContentPolicyReadPort().hasCurrentPaidSubscription(userId, now)
    ? { allowed: true, source: "SUBSCRIPTION" } : denied;
}

export async function resolveCourseEntitlement(
  course: CoursePolicy | null,
  userId?: string,
  now = new Date(),
): Promise<ContentAccessDecision> {
  if (!course) return denied;
  if (course.isPrivate) {
    if (!userId) return denied;
    return await requireContentPolicyReadPort().hasAssignedPrivateCourse(userId, course.id)
      ? { allowed: true, source: "PRIVATE_ASSIGNMENT" } : denied;
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
    if (await requireContentPolicyReadPort().hasActiveGafusArticleAccess(userId, articleId, now))
      return { allowed: true, source: "GAFUS" };
  }
  return denied;
}
