import { createHash } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { connection, cynologistChatQueue, pushQueue } from "@gafus/queues";
import { z } from "zod";
import {
  CHAT_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_ID,
  ChatError,
  streamServer,
} from "./stream";
import { isChatWorkingTime, nextChatReminder } from "./reminder-time";
import { isAssignedChatTrainer } from "./service";

const eventSchema = z.object({
  type: z.enum(["message.new", "message.read", "notification.mark_read"]),
  cid: z.string(),
  created_at: z.string().datetime({ offset: true }),
  user: z.object({ id: z.string() }).optional(),
  message: z
    .object({
      id: z.string(),
      created_at: z.string().datetime({ offset: true }).optional(),
      user: z.object({ id: z.string() }),
    })
    .optional(),
});
export async function acceptChatWebhook(rawBody: string, signature: string) {
  if (!signature || !streamServer().verifyWebhook(rawBody, signature))
    throw new ChatError("INVALID_SIGNATURE", "Неверная подпись", 401);
  const raw = JSON.parse(rawBody) as Record<string, unknown>;
  if (!["message.new", "message.read", "notification.mark_read"].includes(String(raw.type))) return;
  const event = eventSchema.parse(raw);
  if (!event.cid.startsWith(`${CHAT_CHANNEL_TYPE}:`)) return;
  // Persist only identifiers and timestamps; never duplicate private message text in the inbox.
  const id = createHash("sha256")
    .update(
      JSON.stringify(
        event.type === "message.new"
          ? { type: event.type, cid: event.cid, messageId: event.message?.id }
          : event,
      ),
    )
    .digest("hex");
  await prisma.chatWebhookEvent.upsert({
    where: { id },
    update: {},
    create: { id, payload: event as Prisma.InputJsonValue },
  });
  await cynologistChatQueue.add(
    "event",
    { eventId: id },
    {
      jobId: `event-${id}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
    },
  );
}
async function enqueuePush(id: string, chatId: string, userId: string, body: string, url: string) {
  const notificationId = `chat-${id}`;
  // Transactional outbox + deterministic push job avoids duplicate creation on worker retries.
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.chatNotification.findUnique({ where: { id } });
      if (existing) return;
      const subscriptions = await tx.pushSubscription.findMany({
        where: { userId },
        select: { endpoint: true, keys: true },
      });
      if (!subscriptions.length) {
        await tx.chatNotification.create({ data: { id, chatId, userId } });
        return;
      }
      await tx.stepNotification.create({
        data: {
          id: notificationId,
          userId,
          day: 0,
          stepIndex: 0,
          endTs: Math.floor(Date.now() / 1000),
          sent: false,
          paused: false,
          type: "immediate",
          stepTitle: `Чат с кинологом|${body}`,
          url,
          subscription: {
            subscriptions: subscriptions.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
            count: subscriptions.length,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.chatNotification.create({ data: { id, chatId, userId, notificationId } });
    },
    { isolationLevel: "Serializable" },
  );
  const record = await prisma.chatNotification.findUnique({ where: { id } });
  if (record?.notificationId)
    await pushQueue.add(
      "push",
      { notificationId: record.notificationId },
      {
        jobId: record.notificationId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 10000 },
      },
    );
}
/** Current Stream read state wins over webhook delivery order. */
export async function refreshChatUnread(chatId: string, now = new Date(), eventTime?: Date) {
  const chat = await prisma.cynologistChat.findUnique({ where: { id: chatId } });
  if (!chat || chat.provisionStatus !== "READY") return;
  const state = await streamServer()
    .channel(CHAT_CHANNEL_TYPE, chat.streamChannelId)
    .query({ state: true, messages: { limit: 1 } });
  const read = state.read?.find((r) => r.user.id === `gafus-${chat.trainerUserId}`);
  if (!read) throw new ChatError("CHAT_READ_UNAVAILABLE", "Состояние прочтения недоступно", 503);
  const readAt = new Date(read.last_read);
  const unread = (read.unread_messages ?? 0) > 0;
  if (!unread) {
    // Do not let a stale query close messages committed after its read marker.
    await prisma.cynologistChat.updateMany({
      where: {
        id: chatId,
        OR: [{ lastClientMessageAt: null }, { lastClientMessageAt: { lte: readAt } }],
      },
      data: { trainerReadAt: readAt, unreadSince: null, nextReminderAt: null },
    });
  } else {
    const since =
      eventTime && eventTime > readAt
        ? eventTime
        : (chat.unreadSince ?? chat.lastClientMessageAt ?? now);
    await prisma.cynologistChat.updateMany({
      where: { id: chatId, unreadSince: null },
      data: { trainerReadAt: readAt, unreadSince: since, nextReminderAt: nextChatReminder(since) },
    });
    // A delayed older webhook can refine the start, but must not restart an existing reminder schedule.
    await prisma.cynologistChat.updateMany({
      where: { id: chatId, unreadSince: { gt: since } },
      data: { trainerReadAt: readAt, unreadSince: since },
    });
  }
  return unread;
}
export async function processChatEvent(eventId: string) {
  const record = await prisma.chatWebhookEvent.findUnique({ where: { id: eventId } });
  if (!record || record.processedAt) return;
  const event = eventSchema.parse(record.payload);
  const chat = await prisma.cynologistChat.findUnique({
    where: { streamChannelId: event.cid.slice(CHAT_CHANNEL_TYPE.length + 1) },
  });
  if (!chat) {
    await prisma.chatWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
    return;
  }
  if (chat.provisionStatus !== "READY") return; // Provisioning can finish later; sweeper retries the inbox.
  const time = new Date(event.message?.created_at ?? event.created_at);
  if (event.type === "message.new" && event.message) {
    const sender = event.message.user.id;
    if (![chat.clientUserId, chat.trainerUserId].some((id) => `gafus-${id}` === sender)) {
      throw new ChatError("CHAT_INVALID_SENDER", "Недопустимый отправитель", 403);
    }
    await prisma.cynologistChat.updateMany({
      where: { id: chat.id, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: time } }] },
      data: { lastMessageAt: time },
    });
    const clientMessage = sender === `gafus-${chat.clientUserId}`;
    if (clientMessage) {
      await prisma.cynologistChat.updateMany({
        where: {
          id: chat.id,
          OR: [{ lastClientMessageAt: null }, { lastClientMessageAt: { lt: time } }],
        },
        data: { lastClientMessageAt: time },
      });
      if (await isAssignedChatTrainer(chat.trainerUserId)) {
        await enqueuePush(
          `message-${event.message.id}`,
          chat.id,
          chat.trainerUserId,
          "Новое сообщение в диалоге",
          `/cynologist-chats/${chat.id}`,
        );
      }
    } else {
      await enqueuePush(
        `message-${event.message.id}`,
        chat.id,
        chat.clientUserId,
        "Кинолог ответил в вашем диалоге",
        "/cynologist-chat",
      );
    }
  }
  await refreshChatUnread(
    chat.id,
    new Date(),
    event.message?.user.id === `gafus-${chat.clientUserId}` ? time : undefined,
  );
  await prisma.chatWebhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date() },
  });
}
export async function processChatSweep(now = new Date()) {
  await cleanupChatAttachments(now);
  const cursor = await connection.get("chat-reconcile-cursor");
  const chats = await prisma.cynologistChat.findMany({
    where: { provisionStatus: "READY", ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: "asc" },
    take: 25,
  });
  for (const chat of chats) {
    const channel = streamServer().channel(CHAT_CHANNEL_TYPE, chat.streamChannelId);
    if (!(await isAssignedChatTrainer(chat.trainerUserId))) {
      await channel.removeMembers([`gafus-${chat.trainerUserId}`]);
      continue;
    }
    const state = await channel.query({ state: true, messages: { limit: 100 } });
    for (const message of state.messages ?? []) {
      if (!message.id || !message.user?.id || !message.created_at) continue;
      const key = createHash("sha256")
        .update(JSON.stringify({ type: "message.new", cid: channel.cid, messageId: message.id }))
        .digest("hex");
      const payload = {
        type: "message.new",
        cid: channel.cid,
        created_at: new Date(message.created_at).toISOString(),
        message: {
          id: message.id,
          created_at: new Date(message.created_at).toISOString(),
          user: { id: message.user.id },
        },
      };
      await prisma.chatWebhookEvent.upsert({
        where: { id: key },
        update: {},
        create: { id: key, payload },
      });
    }
    await refreshChatUnread(chat.id, now);
  }
  if (chats.length === 25)
    await connection.set("chat-reconcile-cursor", chats[chats.length - 1].id);
  else await connection.del("chat-reconcile-cursor");
  const pending = await prisma.chatWebhookEvent.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const e of pending) await processChatEvent(e.id);
  const due = await prisma.cynologistChat.findMany({
    where: { nextReminderAt: { lte: now }, provisionStatus: "READY" },
    take: 100,
  });
  for (const chat of due) {
    if (
      !(await isAssignedChatTrainer(chat.trainerUserId)) ||
      !(await refreshChatUnread(chat.id, now))
    )
      continue;
    // Re-roll a missed job outside the work window without sending overnight.
    const inWindow = isChatWorkingTime(now);
    if (inWindow)
      await enqueuePush(
        `reminder-${chat.id}-${chat.nextReminderAt!.getTime()}`,
        chat.id,
        chat.trainerUserId,
        "В диалоге есть непрочитанные сообщения",
        `/cynologist-chats/${chat.id}`,
      );
    await prisma.cynologistChat.updateMany({
      where: { id: chat.id, nextReminderAt: chat.nextReminderAt },
      data: {
        nextReminderAt: nextChatReminder(inWindow ? now : new Date(now.getTime() - 5 * 3600_000)),
      },
    });
  }
}

export async function cleanupChatAttachments(now = new Date()) {
  const stale = await prisma.chatAttachment.findMany({
    where: { state: "READY", createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
    include: { chat: true },
    take: 50,
  });
  for (const file of stale) {
    const claimed = await prisma.chatAttachment.updateMany({
      where: { id: file.id, state: "READY" },
      data: { state: "DELETING" },
    });
    if (!claimed.count) continue;
    const channel = streamServer().channel(CHAT_CHANNEL_TYPE, file.chat.streamChannelId);
    try {
      await (file.kind === "image" ? channel.deleteImage(file.url) : channel.deleteFile(file.url));
      await prisma.chatAttachment.delete({ where: { id: file.id } });
    } catch {
      await prisma.chatAttachment.update({ where: { id: file.id }, data: { state: "READY" } });
    }
  }
  const communityFiles = await prisma.communityChatAttachment.findMany({
    where: { state: "READY", createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
    take: 50,
  });
  for (const file of communityFiles) {
    const claimed = await prisma.communityChatAttachment.updateMany({
      where: { id: file.id, state: "READY" },
      data: { state: "DELETING" },
    });
    if (!claimed.count) continue;
    const channel = streamServer().channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID);
    try {
      await (file.kind === "image" ? channel.deleteImage(file.url) : channel.deleteFile(file.url));
      await prisma.communityChatAttachment.delete({ where: { id: file.id } });
    } catch {
      await prisma.communityChatAttachment.update({
        where: { id: file.id },
        data: { state: "READY" },
      });
    }
  }
}
