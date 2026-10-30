import { prisma } from "@gafus/prisma";

/** Core-owned notification and subscription reads for push transport workers. */
async function boundNotificationIsStillCurrent(notification: {
  userId: string;
  dayOnCourseId: string | null;
  stepOnDayId: string | null;
  originalStepId: string | null;
  type: string;
}): Promise<boolean> {
  if (notification.type !== "step" || (!notification.dayOnCourseId && !notification.stepOnDayId))
    return true; // Legacy/native and non-step notifications remain unchanged.
  if (!notification.dayOnCourseId || !notification.stepOnDayId || !notification.originalStepId)
    return false;
  const [belongsToDay, running] = await Promise.all([
    prisma.dayOnCourse.findFirst({
      where: {
        id: notification.dayOnCourseId,
        day: {
          stepLinks: {
            some: {
              id: notification.stepOnDayId,
              stepId: notification.originalStepId,
            },
          },
        },
      },
      select: { id: true },
    }),
    prisma.userStep.findFirst({
      where: {
        stepOnDayId: notification.stepOnDayId,
        userTraining: {
          userId: notification.userId,
          dayOnCourseId: notification.dayOnCourseId,
        },
        status: "IN_PROGRESS",
        paused: false,
      },
      select: { id: true },
    }),
  ]);
  return !!belongsToDay && !!running;
}

export async function getPushNotificationForDelivery(notificationId: string) {
  const notification = await prisma.stepNotification.findUnique({ where: { id: notificationId } });
  if (notification && !(await boundNotificationIsStillCurrent(notification))) return null;
  return notification;
}

export async function getUserPushSubscriptionsForDelivery(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

export async function deleteInvalidPushEndpoint(endpoint: string): Promise<number> {
  const result = await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return result.count;
}

export async function recordPushNotificationDelivery(notificationId: string, sent: boolean) {
  await prisma.stepNotification.update({
    where: { id: notificationId },
    data: { sent },
  });
}

/** Reject delayed jobs after a subscription or job ID has been replaced. */
export async function getEligiblePushNotificationJob(notificationId: string, jobId: string) {
  const notification = await prisma.stepNotification.findUnique({
    where: { id: notificationId, jobId },
    select: {
      id: true,
      jobId: true,
      sent: true,
      paused: true,
      userId: true,
      type: true,
      dayOnCourseId: true,
      stepOnDayId: true,
      originalStepId: true,
    },
  });
  if (notification && !(await boundNotificationIsStillCurrent(notification))) return null;
  return notification;
}
