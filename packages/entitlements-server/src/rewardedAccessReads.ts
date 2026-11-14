/**
 * Read-only, actor-scoped infrastructure projections for legacy paid-step and
 * video entitlement policy. Business decisions (free/day/private, role, Gafus,
 * subscription, guide grants) remain exclusively in Core. A global Step or
 * bare media URL never independently authorizes a private course occurrence.
 */
import { prisma } from "@gafus/prisma";

/** A learning-day link is only visible through an enrolled UserTraining. */
export function readOwnedCourseDayRewardedSteps(userId: string, dayOnCourseId: string) {
  if (!userId || !dayOnCourseId) return Promise.resolve(null);
  return prisma.dayOnCourse.findFirst({
    where: { id: dayOnCourseId, userTrainings: { some: { userId } } },
    select: {
      day: { select: { stepLinks: {
        orderBy: { order: "asc" as const },
        select: { id: true, step: { select: { type: true } } },
      } } },
    },
  });
}

/** Exact progress row bound to the current user and the physical course day. */
export function readOwnedRewardedUserStep(userId: string, userStepId: string) {
  if (!userId || !userStepId) return Promise.resolve(null);
  return prisma.userStep.findFirst({
    where: { id: userStepId, userTraining: { userId } },
    select: {
      stepOnDay: { select: { id: true, step: { select: { type: true } } } },
      userTraining: { select: {
        dayOnCourse: { select: { course: { select: { id: true, isPaid: true, isPrivate: true } } } },
      } },
    },
  });
}

/** Exact owner-specific assignment for *one* private course. */
export function readRewardedPrivateCourseAssignment(userId: string, courseId: string) {
  if (!userId || !courseId) return Promise.resolve(null);
  return prisma.courseAccess.findFirst({
    where: { userId, courseId }, select: { courseId: true },
  });
}

export function readOwnedDailyRewardedUserStep(userId: string, userStepId: string) {
  if (!userId || !userStepId) return Promise.resolve(null);
  return prisma.dailyCourseUserStep.findFirst({
    where: { id: userStepId, dailyCourseUserTraining: { userId } },
    select: {
      bundleStepId: true,
      dailyCourseUserTraining: { select: { scheduleId: true } },
      bundleStep: { select: { step: { select: { type: true } } } },
    },
  });
}

/** A daily-course video is free only when its schedule is published and due. */
export function readPublishedDailyRewardedVideo(videoUrl: string, at: Date) {
  if (!videoUrl) return Promise.resolve(null);
  return prisma.dailyCourseBundleStep.findFirst({
    where: {
      step: { videoUrl },
      bundle: { schedules: { some: { isPublished: true, date: { lte: at } } } },
    },
    select: { id: true },
  });
}

/** A video match alone is not an entitlement; restrict to this owner's row. */
export function readOwnedRewardedVideoStep(userId: string, videoUrl: string) {
  if (!userId || !videoUrl) return Promise.resolve(null);
  return prisma.userStep.findFirst({
    where: { userTraining: { userId }, stepOnDay: { step: { videoUrl } } },
    select: {
      stepOnDay: { select: { id: true, step: { select: { type: true } } } },
      userTraining: { select: {
        dayOnCourse: { select: { course: { select: { id: true, isPaid: true, isPrivate: true } } } },
      } },
    },
  });
}

/** Retired rewarded-target grant is used only by its legacy entitlement check. */
export function readActiveLegacyRewardedGrant(
  userId: string, targetType: "ARTICLE" | "COURSE_STEP", targetId: string, at: Date,
) {
  if (!userId || !targetId) return Promise.resolve(null);
  return prisma.rewardedTargetAccess.findFirst({
    where: { userId, targetType, targetId, expiresAt: { gt: at } },
    select: { id: true },
  });
}

export function readRewardedViewerRole(userId: string) {
  if (!userId) return Promise.resolve(null);
  return prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
}

/** Enumerate each course occurrence independently; Core must still enforce
 * private assignment, paid/free status and step type per occurrence. */
export function readRewardedCourseVideoOccurrences(videoUrl: string) {
  if (!videoUrl) return Promise.resolve([]);
  return prisma.dayOnCourse.findMany({
    where: { day: { stepLinks: { some: { step: { videoUrl } } } } },
    select: {
      course: { select: { id: true, isPrivate: true, isPaid: true } },
      day: { select: { stepLinks: {
        where: { step: { videoUrl } },
        select: { id: true, step: { select: { type: true } } },
      } } },
    },
  });
}

/** Notifications are always scoped to the requesting owner and an unsent row. */
export function readPendingRewardedStepNotificationUrl(
  userId: string, day: number, stepIndex: number,
) {
  if (!userId) return Promise.resolve(null);
  return prisma.stepNotification.findFirst({
    where: { userId, day, stepIndex, sent: false },
    orderBy: { createdAt: "desc" },
    select: { url: true },
  });
}
