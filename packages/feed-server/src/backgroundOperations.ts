import { prisma } from "@gafus/prisma";
import { createFeedMaintenance } from "./maintenance.js";
import { createFeedNotificationOutbox, type FeedNotificationDelivery } from "./notificationOutbox.js";
export type { FeedNotificationDelivery } from "./notificationOutbox.js";

/** Domain jobs/outbox policy stays in Core; concrete Prisma binding belongs to feed-server. */
export async function runFeedBackgroundOperations(
  delivery: FeedNotificationDelivery,
  sendPush: boolean,
) {
  const cleanup = await createFeedMaintenance({ db: prisma }).run(20);
  const push = sendPush
    ? await createFeedNotificationOutbox({ db: prisma, delivery }).process(10)
    : { claimed: 0, delivered: 0, completed: 0 };
  return { cleanup, push };
}

export async function getFeedPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, keys: true },
  });
}
