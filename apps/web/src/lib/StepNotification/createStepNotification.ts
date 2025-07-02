import { prisma } from "@gafus/prisma";
import { pushQueue } from "@queues/push-queue";

export async function createStepNotificationsForUserStep({
  userId,
  day,
  stepIndex,
  durationSec,
  maybeUrl,
}: {
  userId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
  maybeUrl?: string;
}): Promise<void> {
  const nowTs = Math.floor(Date.now() / 1000);
  const endTs = nowTs + durationSec;

  const subscription = await prisma.pushSubscription.findFirst({
    where: { userId },
  });

  if (!subscription) {
    throw new Error("No push subscription found for user");
  }

  const notif = await prisma.stepNotification.create({
    data: {
      userId,
      day,
      stepIndex,
      endTs,
      url: maybeUrl,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
    },
  });

  try {
    const job = await pushQueue.add(
      "send-step-notification",
      { notificationId: notif.id },
      {
        delay: durationSec * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: { jobId: job.id },
    });
  } catch (err) {
    console.error("❌ Error adding job to queue:", err);
    throw err;
  }
}
