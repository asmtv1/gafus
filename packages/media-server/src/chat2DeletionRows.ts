import { prisma } from "@gafus/prisma";

/** Mark a terminal media task before any external object deletion. */
export async function prepareChat2V2MediaDeletion(mediaId: string) {
  const task = await prisma.chat2V2MediaTask.findUnique({ where: { mediaId } });
  if (!task) throw Error("CHAT2_V2_DELETE_TASK_MISSING");
  if (!["READY", "FAILED", "EXPIRED"].includes(task.status))
    throw Error("CHAT2_V2_DELETE_ACTIVE_PROCESSING");
  const base = `chat2/${task.conversationId}/${task.ownerId}/${task.mediaId}`;
  if (!task.sourceKey.startsWith(base + "/incoming/source."))
    throw Error("CHAT2_V2_DELETE_INVALID_SOURCE");
  const finalBase = base + "/v1/";
  // Mark the row before touching S3. A crash can be retried from both this
  // independent deletion intent and the Media V2 terminal-cleanup queue.
  const claimed = await prisma.chat2V2MediaTask.updateMany({
    where: { mediaId, status: { in: ["READY", "FAILED", "EXPIRED"] } },
    data: {
      status: "EXPIRED",
      cleanupKind: "ALL",
      cleanupNextAt: new Date(),
      cleanupCompletedAt: null,
    },
  });
  if (claimed.count !== 1) throw Error("CHAT2_V2_DELETE_ACTIVE_PROCESSING");
  return { sourceKey: task.sourceKey, finalBase };
}

export async function completeChat2V2MediaDeletion(mediaId: string) {
  await prisma.chat2V2MediaTask.updateMany({
    where: { mediaId, status: "EXPIRED" },
    data: {
      cleanupKind: null,
      cleanupCompletedAt: new Date(),
      cleanupToken: null,
      cleanupLeaseUntil: null,
    },
  });
}

export async function readDeletedChat2Attachments(conversationId: string, messageId: string) {
  const message = await prisma.chat2Message.findUnique({
    where: { id: messageId },
    select: { deletedAt: true, conversationId: true },
  });
  if (!message?.deletedAt || message.conversationId !== conversationId) return [];
  return prisma.chat2Media.findMany({
    where: { conversationId, messageId, status: { in: ["READY", "REMOVING"] } },
    select: { id: true, objectKey: true },
  });
}

export async function markChat2AttachmentRemoving(id: string, messageId: string) {
    await prisma.chat2Media.updateMany({
      where: { id: id, messageId, status: "READY" },
      data: { status: "REMOVING" },
    });
}

export async function completeChat2AttachmentDeletion(item: { id: string; objectKey: string }, messageId: string) {
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

export function readDueChat2DeletionIntents(now: Date, limit: number, onlyObjectKey?: string) {
  return prisma.chat2MediaDeletionIntent.findMany({
    where: {
      ...(onlyObjectKey ? { objectKey: onlyObjectKey } : {}),
      status: { in: ["PENDING", "RESERVED"] },
      availableAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
}

export function claimChat2DeletionIntent(intent: { objectKey: string; status: string; attempts: number }, lease: Date) {
    return prisma.chat2MediaDeletionIntent.updateMany({
      where: {
        objectKey: intent.objectKey,
        status: intent.status,
        attempts: intent.attempts,
        availableAt: { lte: new Date() },
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: { claimedUntil: lease, attempts: { increment: 1 } },
    });
}

export function readLiveChat2Media(objectKey: string) {
      return prisma.chat2Media.findUnique({
        where: { objectKey: objectKey },
        select: { id: true },
      });
}

export function acknowledgeChat2DeletionIntent(intent: { objectKey: string; status: string }, lease: Date) {
  return prisma.chat2MediaDeletionIntent.updateMany({
    where: { objectKey: intent.objectKey, status: intent.status, claimedUntil: lease },
    data: { status: "DONE", completedAt: new Date(), claimedUntil: null, errorCode: null },
  });
}

export async function retryChat2DeletionIntent(intent: { objectKey: string; status: string; attempts: number }, lease: Date) {
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
