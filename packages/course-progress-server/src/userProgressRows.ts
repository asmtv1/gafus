/**
 * Actor/course-scoped persistence for the detailed learner progress projection.
 * Pure calculation of day/step statuses and readOnly behavior remains in Core.
 * No access to arbitrary user progress by unscoped list methods.
 */
import { prisma, type TrainingStatus as PrismaTrainingStatus } from "@gafus/prisma";

export function readOwnedCourseProgressRow(userId: string, courseId: string) {
  return prisma.userCourse.findFirst({
    where: { courseId, userId },
    include: {
      user: {
        select: {
          username: true,
          profile: { select: { avatarUrl: true } },
        },
      },
    },
  });
}

export function readCourseDaysProgressRows(courseId: string) {
  return prisma.dayOnCourse.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: {
      day: {
        select: {
          title: true,
          shareProgressAcrossCourses: true,
          stepLinks: {
            orderBy: { order: "asc" },
            include: { step: { select: { title: true } } },
          },
        },
      },
    },
  });
}

export function readSharedCompletedTrainingRows(userId: string, sharedDayIds: string[]) {
  return prisma.userTraining.findMany({
    where: {
      userId,
      status: "COMPLETED",
      dayOnCourse: { dayId: { in: sharedDayIds } },
    },
    select: {
      status: true,
      updatedAt: true,
      steps: {
        select: {
          stepOnDayId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      dayOnCourse: { select: { dayId: true } },
    },
  });
}

export function readOwnedCourseTrainingStatuses(userId: string, courseId: string) {
  return prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourse: { courseId },
    },
    select: { id: true, status: true, dayOnCourseId: true },
  });
}

export function readTrainingStartedSteps(userTrainingIds: string[]) {
  return prisma.userStep.findMany({
    where: {
      userTrainingId: { in: userTrainingIds },
      status: {
        in: ["IN_PROGRESS", "COMPLETED"],
      },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export function writeOwnedUserCourseProgress(
  userId: string,
  courseId: string,
  updateData: { status: string; startedAt: Date | null; completedAt?: Date | null },
) {
  if (
    !userId ||
    !courseId ||
    !["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(updateData.status)
  )
    throw new Error("USER_COURSE_PROGRESS_STATUS_INVALID");
  return prisma.userCourse.update({
    where: {
      userId_courseId: { userId, courseId },
    },
    data: {
      ...updateData,
      status: updateData.status as PrismaTrainingStatus,
    },
  });
}

export function readProgressDisplayAccount(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      profile: { select: { avatarUrl: true } },
    },
  });
}

export function readOwnedCourseTrainingTimeline(userId: string, courseId: string) {
  return prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourse: { courseId },
    },
    select: { createdAt: true, updatedAt: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

export function readOwnedCourseTrainingDayRows(userId: string, courseId: string) {
  return prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourse: { courseId },
    },
    include: {
      steps: { include: { stepOnDay: true } },
    },
  });
}
