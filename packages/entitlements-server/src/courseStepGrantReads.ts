/**
 * Single-occurrence entitlement reads on the injected data-store boundary.
 * Business policy callbacks originate in Core, so the server never guesses
 * whether a video/step belongs to the requested day or is private/free.
 * These are READ operations; do not infer grants from global Step/media ids.
 */
import { prisma, type Prisma } from "@gafus/prisma";

type CourseStepAccessTarget = {
  type: "COURSE_STEP";
  targetKey: string;
  courseId: string;
  isPrivate: boolean;
  monetized: boolean;
};
type ResolveTarget<T extends CourseStepAccessTarget> = (
  db: Prisma.TransactionClient,
  dayOnCourseId: string,
  stepOnDayId: string,
) => Promise<T | null>;

/** A Gafus grant only applies to this exact public, monetized occurrence.
 * A full guide grant is shared with its children, but never another course.
 */
export async function readActiveCourseStepGafusGrant<T extends CourseStepAccessTarget>(
  input: { userId: string; dayOnCourseId: string; stepOnDayId: string; now?: Date },
  resolveTarget: ResolveTarget<T>,
): Promise<boolean> {
  if (!input.userId || !input.dayOnCourseId || !input.stepOnDayId) return false;
  const target = await resolveTarget(prisma, input.dayOnCourseId, input.stepOnDayId);
  if (!target || target.isPrivate || !target.monetized) return false;
  const now = input.now ?? new Date();
  const grant = await prisma.gafusTargetAccess.findFirst({
    where: {
      userId: input.userId,
      targetType: "COURSE_STEP",
      targetKey: target.targetKey,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (grant) return true;
  const guide = await prisma.course.findFirst({
    where: { id: target.courseId, guideContent: { not: "" } },
    select: { id: true },
  });
  if (!guide) return false;
  const shared = await prisma.gafusTargetAccess.findFirst({
    where: {
      userId: input.userId,
      targetType: "MINI_GUIDE",
      targetKey: `mini-guide:${target.courseId}`,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  return Boolean(shared);
}

/** Same authoritative policy path as purchase/unlock/progress gates. The
 * projections are resolved through a single client, with no media-ID bypass.
 */
export async function readAllowedVideoCourseStepAccess<T extends CourseStepAccessTarget>(
  input: { userId: string; dayOnCourseId: string; stepOnDayId: string; now: Date },
  resolveTarget: ResolveTarget<T>,
  resolveEntitlement: (
    db: Prisma.TransactionClient,
    userId: string,
    target: T,
    now: Date,
  ) => Promise<{ allowed: boolean }>,
): Promise<boolean> {
  if (!input.userId || !input.dayOnCourseId || !input.stepOnDayId) return false;
  const target = await resolveTarget(prisma, input.dayOnCourseId, input.stepOnDayId);
  if (!target) return false;
  return (await resolveEntitlement(prisma, input.userId, target, input.now)).allowed;
}
