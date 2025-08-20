import { prisma } from "@gafus/prisma";
import { connection, pushQueue } from "@gafus/queues";

console.warn("🔍 pushQueue imported:", pushQueue);
console.warn("🔍 pushQueue name:", pushQueue.name);
console.warn("🔍 REDIS_URL from env:", process.env.REDIS_URL);

// Тестируем подключение к Redis
console.warn("🔍 Redis connection:", connection);

console.warn("🔍 Redis connection:", connection);

export async function createStepNotificationsForUserStep({
  userId,
  day,
  stepIndex,
  durationSec,
  maybeUrl,
  stepTitle,
}: {
  userId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
  maybeUrl?: string;
  stepTitle?: string;
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
      stepTitle,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
    },
  });

  try {
    console.warn("🔍 Adding job to queue:", {
      notificationId: notif.id,
      delay: durationSec * 1000,
      durationSec,
    });

    const job = await pushQueue.add(
      "push",
      { notificationId: notif.id },
      {
        delay: durationSec * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    console.warn("✅ Job added successfully:", job.id);

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: { jobId: job.id },
    });
  } catch (err) {
    console.error("❌ Error adding job to queue:", err);
    if (err instanceof Error) {
      console.error("❌ Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
    }
    throw err;
  }
}
