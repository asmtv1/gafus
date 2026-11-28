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
export type CoursePolicy = { id: string; isPrivate: boolean; isPaid: boolean };
export type ContentAccessDecision = {
  allowed: boolean;
  source: "FREE" | "PRIVATE_ASSIGNMENT" | "SUBSCRIPTION" | "ROLE" | "GATING_DISABLED" | "GAFUS" | "DENIED";
};
const denied: ContentAccessDecision = { allowed: false, source: "DENIED" };

/** The caller supplies authoritative owner-scoped reads and the gating policy.
 * Separate instances can coexist without mutating any process-wide state. */
export function createContentPolicy(
  rows: ContentPolicyReadPort,
  readGatingEnabled: () => Promise<boolean>,
) {
  if (!rows || typeof readGatingEnabled !== "function") throw new Error("CONTENT_POLICY_DEPENDENCIES_REQUIRED");
  /** Role is read from PostgreSQL; an expired subscription never grants access. */
  async function premiumAccess(userId: string, now: Date): Promise<ContentAccessDecision> {
    const role = await rows.readAccessActorRole(userId);
    if (!role) return denied;
    if (role === "ADMIN" || role === "PARTNER" || role === "TRAINER")
      return { allowed: true, source: "ROLE" };
    return await rows.hasCurrentPaidSubscription(userId, now)
      ? { allowed: true, source: "SUBSCRIPTION" } : denied;
  }

  async function resolveCourseEntitlement(
    course: CoursePolicy | null,
    userId?: string,
    now = new Date(),
  ): Promise<ContentAccessDecision> {
    return decideCourseEntitlement(course,
      id => userId ? rows.hasAssignedPrivateCourse(userId, id) : false,
      () => publicPaidAccess(userId, now));
  }

  async function decideCourseEntitlement(
    course: CoursePolicy | null,
    assigned: (courseId: string) => boolean | Promise<boolean>,
    paid: () => Promise<ContentAccessDecision>,
  ): Promise<ContentAccessDecision> {
    if (!course) return denied;
    if (course.isPrivate) return await assigned(course.id)
      ? { allowed: true, source: "PRIVATE_ASSIGNMENT" } : denied;
    return course.isPaid ? paid() : { allowed: true, source: "FREE" };
  }

  /** The projection supplies only this viewer's assignments. Premium status is shared
   * within this read and is re-evaluated on the next request. */
  async function allowedCourseIds(
    courses: readonly (CoursePolicy & { access: readonly { userId: string }[] })[],
    userId: string,
  ): Promise<Set<string>> {
    const now = new Date();
    let premium: Promise<ContentAccessDecision> | undefined;
    const paid = () => premium ??= publicPaidAccess(userId, now);
    const allowed = new Set<string>();
    await Promise.all(courses.map(async course => {
      const decision = await decideCourseEntitlement(course, () => course.access.some(row => row.userId === userId), paid);
      if (decision.allowed) allowed.add(course.id);
    }));
    return allowed;
  }

  async function publicPaidAccess(userId: string | undefined, now: Date): Promise<ContentAccessDecision> {
    if (!await readGatingEnabled())
      return { allowed: true, source: "GATING_DISABLED" };
    if (!userId) return denied;
    return premiumAccess(userId, now);
  }

  /** Paid article HTML is unlocked by subscription or one article-specific
   * seven-day Gafus entitlement on Web, Android and iOS alike. */
  async function resolveArticleEntitlement(
    articleId: string,
    userId?: string,
    platform?: "ANDROID" | "IOS" | "WEB_DESKTOP" | "WEB_TOUCH",
    now = new Date(),
  ): Promise<ContentAccessDecision> {
    if (!await readGatingEnabled())
      return { allowed: true, source: "GATING_DISABLED" };
    if (!userId) return denied;
    const premium = await premiumAccess(userId, now);
    if (premium.allowed) return premium;
    if (articleId) {
      if (await rows.hasActiveGafusArticleAccess(userId, articleId, now))
        return { allowed: true, source: "GAFUS" };
    }
    return denied;
  }
  return { resolveCourseEntitlement, allowedCourseIds, resolveArticleEntitlement };
}

export type ContentPolicy = ReturnType<typeof createContentPolicy>;
