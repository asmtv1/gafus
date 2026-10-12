import { prisma } from "@gafus/prisma";

/** Core-owned notification and subscription reads for push transport workers. */
export async function getPushNotificationForDelivery(notificationId: string) {
  return prisma.stepNotification.findUnique({ where: { id: notificationId } });
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
  return prisma.stepNotification.findUnique({
    where: { id: notificationId, jobId },
    select: { id: true, jobId: true, sent: true, paused: true },
  });
}
