import { prisma, type Prisma } from "@gafus/prisma";

export async function prepareChat2PushReceipt(conversationId: string, messageId: string, trainerUserId: string | null): Promise<string | null> {
  const [c, message] = await Promise.all([
    prisma.chat2Conversation.findUnique({ where: { id: conversationId } }),
    prisma.chat2Message.findUnique({ where: { id: messageId } }),
  ]);
  if (!c || !message || message.deletedAt || message.conversationId !== conversationId || !["CYNOLOGIST", "DIRECT"].includes(c.kind)) return null;
  let recipientId: string | null = null;
  if (c.kind === "CYNOLOGIST") {
    if (message.authorId !== c.createdById) return null;
    recipientId = trainerUserId;
    if (!recipientId || recipientId === message.authorId) return null;
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
      return null;
  }
  const member = await prisma.chat2Member.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: recipientId },
    },
  });
  if (!member || member.role === "BANNED" || (member.mutedUntil && member.mutedUntil > new Date()))
    return null;
  const notificationId = `chat2-${messageId}-${recipientId}`;
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.chat2PushReceipt.findUnique({
        where: {
          messageId_recipientId: { messageId, recipientId },
        },
      });
      if (existing) return null;
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
  return receipt?.notificationId ?? null;
}

const CHAT2_DLQ_UNCLAIMABLE_AT = new Date("9999-12-31T00:00:00.000Z");
type OutboxItem = { attempts: number; id: string; operationId: string | null; lastErrorCode: string | null };

export async function readChat2OutboxMetrics(now: Date) {
  const pending = { deliveredAt: null, deadLetteredAt: null };
  const [count, dead, oldest, leased] = await Promise.all([
    prisma.chat2OutboxEvent.count({ where: pending }),
    prisma.chat2OutboxEvent.count({ where: { deadLetteredAt: { not: null } } }),
    prisma.chat2OutboxEvent.findFirst({
      where: pending,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.chat2OutboxEvent.count({ where: { ...pending, claimedUntil: { gt: now } } }),
  ]);
  return { pending: count, dead, oldest: oldest?.createdAt ?? null, leased };
}

export function readDueChat2Outbox(now: Date, limit: number) {
  return prisma.chat2OutboxEvent.findMany({
    where: {
      deliveredAt: null,
      deadLetteredAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });
}

export function quarantineExhaustedChat2Outbox(item: Pick<OutboxItem, "id" | "lastErrorCode" | "attempts">) {
  return prisma.chat2OutboxEvent.updateMany({
        where: {
          id: item.id,
        attempts: item.attempts,
        nextAttemptAt: { lte: new Date() },
          deliveredAt: null,
          deadLetteredAt: null,
          OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
        },
        data: {
          deadLetteredAt: new Date(),
          nextAttemptAt: CHAT2_DLQ_UNCLAIMABLE_AT,
          claimedUntil: null,
          claimToken: null,
          lastErrorCode: item.lastErrorCode ?? "CHAT2_OUTBOX_ATTEMPTS_EXHAUSTED",
        },
      });
}

export function claimChat2Outbox(item: Pick<OutboxItem, "id" | "operationId" | "attempts">, claimToken: string, until: Date) {
  return prisma.chat2OutboxEvent.updateMany({
      where: {
        id: item.id,
        attempts: item.attempts,
        nextAttemptAt: { lte: new Date() },
        deliveredAt: null,
        deadLetteredAt: null,
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: {
        claimedUntil: until,
        claimToken,
        operationId: item.operationId ?? item.id,
        attempts: { increment: 1 },
      },
    });
}

export function renewChat2OutboxClaim(id: string, claimToken: string) {
  return prisma.chat2OutboxEvent.updateMany({
          where: {
            id: id,
            claimToken,
            deliveredAt: null,
            deadLetteredAt: null,
            claimedUntil: { gt: new Date() },
          },
          data: { claimedUntil: new Date(Date.now() + 30_000) },
        });
}

export function acknowledgeChat2Outbox(id: string, claimToken: string) {
  return prisma.chat2OutboxEvent.updateMany({
              where: { id: id, claimToken, deliveredAt: null, deadLetteredAt: null },
              data: {
                deliveredAt: new Date(),
                claimedUntil: null,
                claimToken: null,
                lastErrorCode: null,
              },
            });
}

export function failChat2Outbox(id: string, claimToken: string, code: string, terminal: boolean, retryAt: Date) {
  return prisma.chat2OutboxEvent.updateMany({
    where: { id, claimToken, deliveredAt: null, deadLetteredAt: null },
    data: {
      claimedUntil: null, claimToken: null, lastErrorCode: code,
      ...(terminal ? { deadLetteredAt: new Date(), nextAttemptAt: CHAT2_DLQ_UNCLAIMABLE_AT }
        : { nextAttemptAt: retryAt }),
    },
  });
}
