import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";
export async function reconcileQuestionNotifications() {
  const rows = await prisma.stepNotification.findMany({
    where: {
      id: { startsWith: "question-" },
      user: { pushSubscriptions: { some: {} } },
      sent: false,
      paused: false,
      createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    const job = await pushQueue.getJob(row.id);
    if (job) {
      if (["failed", "completed"].includes(await job.getState())) await job.remove();
      else continue;
    }
    await pushQueue.add(
      "push",
      { notificationId: row.id },
      {
        jobId: row.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    );
  }
}
