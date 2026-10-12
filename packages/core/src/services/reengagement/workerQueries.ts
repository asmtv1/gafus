import { prisma } from "@gafus/prisma";

/** Core owns persistence and status decisions; worker only renders and delivers push. */
export async function getReengagementCampaignState(campaignId: string) {
  return prisma.reengagementCampaign.findUnique({
    where: { id: campaignId },
    select: { isActive: true, returned: true, unsubscribed: true },
  });
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
