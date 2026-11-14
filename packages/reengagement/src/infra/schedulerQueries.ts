import { prisma } from "@gafus/prisma";

/** Database-side scheduling rules. Queue transport remains a package adapter. */
export async function isReengagementNotificationDue(userId: string, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.reengagementCampaign.findFirst({
    where: { userId, isActive: true },
    select: { nextNotificationDate: true },
  });
  return Boolean(row?.nextNotificationDate && row.nextNotificationDate <= now);
}

export async function getActiveReengagementCampaignForScheduling(userId: string) {
  return prisma.reengagementCampaign.findFirst({
    where: { userId, isActive: true },
    select: { id: true, currentLevel: true },
  });
}
