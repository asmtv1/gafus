/** Chat 2.0 durable outbox: no Stream webhooks, only successful PostgreSQL writes. */
import { prisma } from "@gafus/prisma";
import type { Prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";
import { chat2DeletePrivateMedia, chat2V2DeleteObjects } from "@gafus/cdn-upload";
import { recordChat2PollSuccess, resetChat2PollReadiness, probeChat2BrokerAuth,
  chat2BrokerPublishUrl } from "./chat2-readiness";

async function publish(
  channel: string,
  eventId: string,
  eventType: string,
  messageId: string | null,
) {
  const address = process.env.CHAT2_CENTRIFUGO_HTTP_API;
  const key = process.env.CHAT2_CENTRIFUGO_API_KEY;
  if (!address || !key) throw new Error("CHAT2_CENTRIFUGO_NOT_CONFIGURED");
  const u = chat2BrokerPublishUrl(address);
  if (!u) throw new Error("CHAT2_UNSAFE_REALTIME_ENDPOINT");
  const response = await fetch(u, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ channel, data: { eventId, eventType, messageId } }),
  });
  if (!response.ok) throw new Error("CHAT2_CENTRIFUGO_PUBLISH_FAILED");
  const ack = (await response.json()) as { error?: unknown };
  if (ack.error) throw new Error("CHAT2_CENTRIFUGO_PUBLISH_REJECTED");
}

async function enqueueChatPush(conversationId: string, messageId: string) {
  const [c, message] = await Promise.all([
    prisma.chat2Conversation.findUnique({ where: { id: conversationId } }),
    prisma.chat2Message.findUnique({ where: { id: messageId } }),
  ]);
  if (!c || !message || message.deletedAt || !["CYNOLOGIST", "DIRECT"].includes(c.kind)) return;
  let recipientId: string | null = null;
  if (c.kind === "CYNOLOGIST") {
    if (message.authorId !== c.createdById) return;
    recipientId = process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID ?? null;
    if (!recipientId || recipientId === message.authorId) return;
    const trainer = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { role: true },
    });
    if (trainer?.role !== "TRAINER") throw new Error("CHAT2_TRAINER_ASSIGNMENT_MISMATCH");
  } else {
    const recipient = await prisma.chat2Member.findFirst({
      where: { conversationId, userId: { not: message.authorId } },
      select: { userId: true },
    });
    recipientId = recipient?.userId ?? null;
    if (
      !recipientId ||
      (await prisma.chat2Block.findFirst({
        where: {
          OR: [
            { blockerId: message.authorId, blockedId: recipientId },
            { blockerId: recipientId, blockedId: message.authorId },
          ],
        },
      }))
    )
      return;
  }
  const member = await prisma.chat2Member.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: recipientId },
    },
  });
  if (!member || member.role === "BANNED" || (member.mutedUntil && member.mutedUntil > new Date()))
    return;
  const notificationId = `chat2-${messageId}-${recipientId}`;
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.chat2PushReceipt.findUnique({
        where: {
          messageId_recipientId: { messageId, recipientId },
        },
      });
      if (existing) return;
      const subscriptions = await tx.pushSubscription.findMany({
        where: { userId: recipientId },
        select: { endpoint: true, keys: true },
      });
      if (subscriptions.length)
        await tx.stepNotification.create({
          data: {
            id: notificationId,
            jobId: notificationId,
            userId: recipientId,
            day: 0,
            stepIndex: 0,
            endTs: Math.floor(Date.now() / 1000),
            sent: false,
            paused: false,
            type: "immediate",
            stepTitle:
              c.kind === "CYNOLOGIST"
                ? "Чат с кинологом|Вам написали в чате с кинологом"
                : "Личные сообщения|Вам пришло новое сообщение",
            url: `/chats/${conversationId}`,
            subscription: {
              subscriptions: subscriptions.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
              count: subscriptions.length,
            } as Prisma.InputJsonValue,
          },
        });
      await tx.chat2PushReceipt.create({
        data: {
          messageId,
          recipientId,
          notificationId: subscriptions.length ? notificationId : null,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  const receipt = await prisma.chat2PushReceipt.findUnique({
    where: {
      messageId_recipientId: { messageId, recipientId },
    },
  });
  if (receipt?.notificationId)
    await pushQueue.add(
      "push",
      { notificationId: receipt.notificationId },
      {
        jobId: receipt.notificationId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 10000 },
      },
    );
}

/** Durable, retryable S3 cleanup only for messages explicitly soft-deleted by their owner.
 * The S3 helper itself rejects any non-isolated/prod environment.
 * The database keeps a REMOVING tombstone until the object delete succeeds.
 */
/** Separate S3 bucket for Media V2, still cleaned by the existing durable
 * Chat2 outbox worker. No VM, new queue or untracked direct-delete request.
 * All six keys are server-derived from the persisted reservation identity.
 */
async function deleteChat2MediaObject(key: string): Promise<void> {
  if (!key.startsWith("chat2-v2:")) {
    await chat2DeletePrivateMedia(key);
    return;
  }
  const mediaId=key.slice("chat2-v2:".length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId))
    throw Error("CHAT2_V2_DELETE_INVALID_MARKER");
  const task=await prisma.chat2V2MediaTask.findUnique({where:{mediaId}});
  if (!task) throw Error("CHAT2_V2_DELETE_TASK_MISSING");
  if (!["READY","FAILED","EXPIRED"].includes(task.status))
    throw Error("CHAT2_V2_DELETE_ACTIVE_PROCESSING");
  const base=`chat2/${task.conversationId}/${task.ownerId}/${task.mediaId}`;
  if (!task.sourceKey.startsWith(base + "/incoming/source."))
    throw Error("CHAT2_V2_DELETE_INVALID_SOURCE");
  const finalBase=base+"/v1/";
  // Mark the row before touching S3. A crash can be retried from both this
  // independent deletion intent and the Media V2 terminal-cleanup queue.
  await prisma.chat2V2MediaTask.updateMany({
    where:{mediaId,status:{in:["READY","FAILED","EXPIRED"]}},
    data:{status:"EXPIRED",cleanupKind:"ALL",cleanupNextAt:new Date(),cleanupCompletedAt:null},
  });
  await chat2V2DeleteObjects([task.sourceKey,
    finalBase+"image/s.webp", finalBase+"image/m.webp",
    finalBase+"poster.webp", finalBase+"video/360.mp4", finalBase+"video/720.mp4"]);
  await prisma.chat2V2MediaTask.updateMany({
    where:{mediaId,status:"EXPIRED"},
    data:{cleanupKind:null,cleanupCompletedAt:new Date(),cleanupToken:null,cleanupLeaseUntil:null},
  });
}

async function purgeDeletedChat2Attachments(conversationId: string, messageId: string) {
  const message = await prisma.chat2Message.findUnique({
    where: { id: messageId },
    select: { deletedAt: true, conversationId: true },
  });
  if (!message?.deletedAt || message.conversationId !== conversationId) return;
  const media = await prisma.chat2Media.findMany({
    where: { conversationId, messageId, status: { in: ["READY", "REMOVING"] } },
    select: { id: true, objectKey: true },
  });
  for (const item of media) {
    await prisma.chat2Media.updateMany({
      where: { id: item.id, messageId, status: "READY" },
      data: { status: "REMOVING" },
    });
    await deleteChat2MediaObject(item.objectKey);
    const removed = await prisma.chat2Media.deleteMany({
      where: { id: item.id, messageId, status: "REMOVING" },
    });
    if (removed.count) {
      // AFTER DELETE trigger inserted the durable intent. The S3 delete above
      // already succeeded; mark it complete, or retry harmlessly after a crash.
      await prisma.chat2MediaDeletionIntent.updateMany({
        where: { objectKey: item.objectKey, status: "PENDING" },
        data: { status: "DONE", completedAt: new Date(), claimedUntil: null, errorCode: null },
      });
    }
  }
}

export async function processChat2OutboxOnce(limit = 20) {
  const now = new Date();
  const items = await prisma.chat2OutboxEvent.findMany({
    where: {
      deliveredAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });
  let delivered = 0, failed = 0;
  for (const item of items) {
    const until = new Date(Date.now() + 30000);
    const claimed = await prisma.chat2OutboxEvent.updateMany({
      where: {
        id: item.id,
        deliveredAt: null,
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: { claimedUntil: until, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      if (item.eventType === "message.created" && item.messageId)
        await enqueueChatPush(item.conversationId, item.messageId);
      if (item.eventType === "message.deleted" && item.messageId)
        await purgeDeletedChat2Attachments(item.conversationId, item.messageId);
      await publish(`chat2:${item.conversationId}`, item.id, item.eventType, item.messageId);
      await prisma.chat2OutboxEvent.updateMany({
        where: { id: item.id, claimedUntil: until },
        data: { deliveredAt: new Date(), claimedUntil: null },
      });
      delivered++;
    } catch {
      failed++;
      // Never log private message body, provider credentials, or signed URLs.
      await prisma.chat2OutboxEvent.updateMany({
        where: { id: item.id, claimedUntil: until },
        data: {
          claimedUntil: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60000, 1000 * 2 ** Math.min(6, item.attempts)),
          ),
        },
      });
    }
  }
  return { inspected: items.length, delivered, failed };
}
/** Independent of Chat2Media/User/Conversation cascades. An AFTER DELETE database
 * trigger creates this intent in the same transaction as deleting the row.
 * No raw S3 error, user details, or sensitive keys are logged.
 */
export async function processChat2MediaDeletionIntentsOnce(
  limit = 20,
  // Explicit one-key recovery/testing never touches unrelated pending uploads.
  onlyObjectKey?: string,
) {
  const now = new Date();
  const intents = await prisma.chat2MediaDeletionIntent.findMany({
    where: {
      ...(onlyObjectKey ? { objectKey: onlyObjectKey } : {}),
      status: { in: ["PENDING", "RESERVED"] },
      availableAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  let deleted = 0;
  for (const intent of intents) {
    const lease = new Date(Date.now() + 45_000);
    const claimed = await prisma.chat2MediaDeletionIntent.updateMany({
      where: {
        objectKey: intent.objectKey,
        status: intent.status,
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: { claimedUntil: lease, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      // Recovering a DB commit whose acknowledgement was lost: never delete
      // an S3 object while a live Chat2Media row still references its key.
      const liveMedia = await prisma.chat2Media.findUnique({
        where: { objectKey: intent.objectKey },
        select: { id: true },
      });
      if (liveMedia) {
        await prisma.chat2MediaDeletionIntent.updateMany({
          where: { objectKey: intent.objectKey, status: intent.status, claimedUntil: lease },
          data: { status: "DONE", completedAt: new Date(), claimedUntil: null, errorCode: null },
        });
        continue;
      }
      await deleteChat2MediaObject(intent.objectKey);
      await prisma.chat2MediaDeletionIntent.updateMany({
        where: { objectKey: intent.objectKey, status: intent.status, claimedUntil: lease },
        data: { status: "DONE", completedAt: new Date(), claimedUntil: null, errorCode: null },
      });
      deleted++;
    } catch {
      await prisma.chat2MediaDeletionIntent.updateMany({
        where: { objectKey: intent.objectKey, status: intent.status, claimedUntil: lease },
        data: {
          claimedUntil: null,
          errorCode: "PRIVATE_MEDIA_DELETE_FAILED",
          availableAt: new Date(
            Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(6, intent.attempts)),
          ),
        },
      });
    }
  }
  return { inspected: intents.length, deleted };
}

/** Retain only recently completed cleanup receipts. Pending or leased work must
 * never be pruned. A future Chat2Media DELETE re-creates its intent atomically
 * through the PostgreSQL trigger even after the old DONE row was removed.
 */
export async function pruneChat2CompletedMediaIntentsOnce(limit = 100) {
  const completedBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.chat2MediaDeletionIntent.findMany({
    where: { status: "DONE", completedAt: { lt: completedBefore } },
    select: { objectKey: true },
    orderBy: { completedAt: "asc" },
    take: Math.max(1, Math.min(500, limit)),
  });
  if (!candidates.length) return { inspected: 0, pruned: 0 };
  // The conditional DELETE protects against a concurrent trigger re-arming
  // an old DONE row as PENDING between the read and delete.
  const removed = await prisma.chat2MediaDeletionIntent.deleteMany({
    where: {
      objectKey: { in: candidates.map(({ objectKey }) => objectKey) },
      status: "DONE",
      completedAt: { lt: completedBefore },
    },
  });
  return { inspected: candidates.length, pruned: removed.count };
}

/** Explicit opt-in. Never start a production worker from local ChatGPT operations. */
export function startChat2OutboxWorker() {
  if (process.env.CHAT2_WORKER_ENABLED !== "enabled") return () => undefined;
  let active = true,
    busy = false,
    lastPruneAt = 0;
  const tick = async () => {
    if (!active || busy) return;
    busy = true;
    try {
      try {
        const poll = await processChat2OutboxOnce();
        // Both a real DB poll and authenticated broker /api/info must work.
        // Failed delivery is not healthy merely because the broker /health is 200.
        if (poll.failed === 0 && await probeChat2BrokerAuth()) recordChat2PollSuccess();
        else resetChat2PollReadiness();
      } catch {
        resetChat2PollReadiness();
        /* outbox retries independently of private media cleanup */
      }
      try {
        await processChat2MediaDeletionIntentsOnce();
      } catch {
        /* media cleanup remains durable, retry on next tick */
      }
      // Avoid rescanning DONE receipts on every two-second worker tick.
      if (Date.now() - lastPruneAt >= 60 * 60 * 1000) {
        lastPruneAt = Date.now();
        try {
          await pruneChat2CompletedMediaIntentsOnce();
        } catch {
          /* old DONE receipts can be pruned again on the next hourly pass */
        }
      }
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, 2000);
  timer.unref();
  return () => {
    active = false;
    resetChat2PollReadiness();
    clearInterval(timer);
  };
}
