import { prisma } from "@gafus/prisma";

/** Core owns persistence and status decisions; worker only renders and delivers push. */
export async function getReengagementCampaignState(campaignId: string) {
  return prisma.reengagementCampaign.findUnique({
    where: { id: campaignId },
    select: { isActive: true, returned: true, unsubscribed: true },
  });
}

/** Final fail-closed eligibility check, immediately before an external send.
 * A campaign may have been closed or user notifications disabled after queuing.
 * The worker rechecks on dispatch; this is not a distributed send transaction.
 */
export async function isReengagementDispatchAllowed(
  campaignId: string, userId: string, level: number,
): Promise<boolean> {
  const campaign = await prisma.reengagementCampaign.findUnique({
    where: { id: campaignId },
    select: {
      userId: true, isActive: true, returned: true, unsubscribed: true,
      currentLevel: true,
      user: { select: { reengagementSettings: { select: {
        enabled: true, maxNotificationsPerWeek: true,
      } } } },
    },
  });
  if (!campaign || campaign.userId !== userId || !campaign.user ||
    !campaign.isActive || campaign.returned || campaign.unsubscribed ||
    campaign.currentLevel !== level ||
    campaign.user.reengagementSettings?.enabled === false) return false;

  // Honor the pre-existing ReengagementSettings weekly contact limit, not just
  // the scheduler's campaign intervals. Fail closed for zero/invalid limits.
  const weeklyLimit = campaign.user.reengagementSettings?.maxNotificationsPerWeek ?? 2;
  if (!Number.isSafeInteger(weeklyLimit) || weeklyLimit <= 0) return false;
  const sent = await prisma.reengagementNotification.count({
    where: {
      campaign: { is: { userId } },
      sent: true,
      sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  return sent < weeklyLimit;
}

export async function getReengagementPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, keys: true },
  });
}

export async function deleteInvalidReengagementPushEndpoints(endpoints: string[]) {
  if (!endpoints.length) return 0;
  const removed = await prisma.pushSubscription.deleteMany({
    where: { endpoint: { in: endpoints } },
  });
  return removed.count;
}
