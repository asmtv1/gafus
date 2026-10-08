import { createHash } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { z } from "zod";
import {
  cynologistIntakeSchema,
  storedCynologistIntakeSchema,
  formatCynologistIntake,
  CHAT_LIMITS,
} from "@gafus/consultation-shared";
import type { CynologistChatDto, CynologistChatStateDto } from "@gafus/consultation-shared";
import { getCynologistEntitlements } from "../appSubscription/accessService";
import {
  CHAT_CHANNEL_TYPE,
  CHAT_STREAM_ROLE,
  ChatError,
  chatEnabled,
  requireChatSending,
  streamServer,
  verifyChatPermissions,
} from "./stream";

const uid = (id: string) => `gafus-${id}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const chatMessageSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    text: z.string().trim().max(CHAT_LIMITS.textLength).default(""),
    quotedMessageId: z.string().min(1).max(128).optional(),
    attachmentIds: z
      .array(z.string().min(1).max(128))
      .max(CHAT_LIMITS.attachmentsPerMessage)
      .default([]),
  })
  .refine(
    (v) => v.text.length > 0 || v.attachmentIds.length > 0,
    "Напишите сообщение или приложите файл",
  );
export async function isAssignedChatTrainer(userId: string) {
  if (process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID !== userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "TRAINER";
}
export async function chatForActor(userId: string, chatId?: string) {
  const chat = chatId
    ? await prisma.cynologistChat.findUnique({ where: { id: chatId } })
    : await prisma.cynologistChat.findUnique({ where: { clientUserId: userId } });
  if (!chat) throw new ChatError("CHAT_NOT_FOUND", "Диалог не найден", 404);
  if (
    chat.clientUserId !== userId &&
    !(chat.trainerUserId === userId && (await isAssignedChatTrainer(userId)))
  ) {
    throw new ChatError("CHAT_FORBIDDEN", "Нет доступа к диалогу", 403);
  }
  return chat;
}
export async function requireCanSend(userId: string, chatId?: string) {
  requireChatSending();
  const chat = await chatForActor(userId, chatId);
  if (chat.provisionStatus !== "READY")
    throw new ChatError("CHAT_NOT_READY", "Завершите создание диалога", 409);
  if (
    userId === chat.clientUserId &&
    !(await getCynologistEntitlements(userId)).canUseCynologistChat
  ) {
    throw new ChatError(
      "CHAT_SUBSCRIPTION_REQUIRED",
      "Продлите тариф, чтобы отправлять сообщения",
      403,
    );
  }
  return chat;
}
async function syncChatParticipants(clientUserId: string, trainerUserId: string) {
  const users = await prisma.user.findMany({
    where: { id: { in: [clientUserId, trainerUserId] } },
    select: { id: true, username: true, profile: { select: { avatarUrl: true } } },
  });
  await streamServer().upsertUsers(
    users.map((user) => ({
      id: uid(user.id),
      role: CHAT_STREAM_ROLE,
      name: user.username,
      image: user.profile?.avatarUrl ?? "",
    })),
  );
}

function dto(chat: Awaited<ReturnType<typeof chatForActor>>, unreadCount = 0): CynologistChatDto {
  return {
    id: chat.id,
    streamChannelId: chat.streamChannelId,
    clientUserId: chat.clientUserId,
    trainerUserId: chat.trainerUserId,
    intake: storedCynologistIntakeSchema.parse(chat.intake),
    provisionStatus: chat.provisionStatus,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    unreadCount,
  };
}
export async function getChatState(
  userId: string,
  chatId?: string,
): Promise<CynologistChatStateDto> {
  const [rights, isAssignedTrainer] = await Promise.all([
    getCynologistEntitlements(userId),
    isAssignedChatTrainer(userId),
  ]);
  const chat = chatId
    ? await chatForActor(userId, chatId)
    : await prisma.cynologistChat.findUnique({ where: { clientUserId: userId } });
  return {
    ...rights,
    enabled: chatEnabled(),
    isAssignedTrainer,
    chat: chat ? dto(chat) : null,
    canSend:
      chatEnabled() &&
      Boolean(chat?.provisionStatus === "READY") &&
      (chat?.clientUserId === userId ? rights.canUseCynologistChat : isAssignedTrainer),
    needsIntake: !chat,
  };
}
export async function startChat(userId: string, input: unknown) {
  requireChatSending();
  if (!(await getCynologistEntitlements(userId)).canUseCynologistChat)
    throw new ChatError(
      "CHAT_SUBSCRIPTION_REQUIRED",
      "Для начала переписки нужен месячный или трёхмесячный тариф",
      403,
    );
  let chat = await prisma.cynologistChat.findUnique({ where: { clientUserId: userId } });
  if (!chat) {
    const intake = cynologistIntakeSchema.parse(input);
    const trainerUserId = process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID;
    if (!trainerUserId || !(await isAssignedChatTrainer(trainerUserId)) || trainerUserId === userId)
      throw new ChatError("CHAT_UNAVAILABLE", "Кинолог пока не назначен", 503);
    const channelId = `chat-${hash(userId).slice(0, 40)}`;
    // Database uniqueness chooses the first accepted intake even on concurrent starts.
    chat = await prisma.cynologistChat
      .upsert({
        where: { clientUserId: userId },
        update: {},
        create: {
          clientUserId: userId,
          trainerUserId,
          streamChannelId: channelId,
          firstMessageId: `intake-${hash(userId)}`,
          intake: intake as Prisma.InputJsonValue,
        },
      })
      .catch(async (error: unknown) => {
        if ((error as { code?: string }).code !== "P2002") throw error;
        // Prisma can emulate an upsert when several unique fields participate.
        // A concurrent winner owns the saved intake; never overwrite it.
        return prisma.cynologistChat.findUniqueOrThrow({ where: { clientUserId: userId } });
      });
  }
  await verifyChatPermissions();
  const server = streamServer();
  await syncChatParticipants(chat.clientUserId, chat.trainerUserId);
  const channel = server.channel(CHAT_CHANNEL_TYPE, chat.streamChannelId, {
    members: [uid(userId), uid(chat.trainerUserId)],
    created_by_id: uid(chat.trainerUserId),
  });
  await channel.create();
  await sendOnce(channel, {
    id: chat.firstMessageId,
    text: formatCynologistIntake(storedCynologistIntakeSchema.parse(chat.intake)),
    user_id: uid(userId),
  });
  await prisma.cynologistChat.update({
    where: { id: chat.id },
    data: { provisionStatus: "READY" },
  });
  return getChatState(userId);
}
export async function sendOnce(
  channel: ReturnType<ReturnType<typeof streamServer>["channel"]>,
  message: Parameters<typeof channel.sendMessage>[0],
) {
  try {
    const existing = await streamServer().getMessage(message.id!);
    if (existing.message.cid !== channel.cid || existing.message.user?.id !== message.user_id)
      throw new ChatError("CHAT_MESSAGE_CONFLICT", "Конфликт сообщения", 409);
    return existing;
  } catch (error) {
    // Only a confirmed not-found permits a send. A timeout must be retried with the same ID.
    if ((error as { code?: number }).code !== 16) throw error;
  }
  try {
    return await channel.sendMessage(message, { skip_push: true });
  } catch (error) {
    try {
      const existing = await streamServer().getMessage(message.id!);
      if (existing.message.cid === channel.cid && existing.message.user?.id === message.user_id)
        return existing;
    } catch {
      /* An unconfirmed write stays pending and is checked on the next retry. */
    }
    throw error;
  }
}
export async function getChatSession(userId: string, chatId?: string) {
  const chat = await chatForActor(userId, chatId);
  if (chat.provisionStatus !== "READY")
    throw new ChatError("CHAT_NOT_READY", "Завершите создание диалога", 409);
  await verifyChatPermissions();
  const server = streamServer();
  await syncChatParticipants(chat.clientUserId, chat.trainerUserId);
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    apiKey: server.key,
    userId: uid(userId),
    token: server.createToken(uid(userId), expires),
    expiresAt: new Date(expires * 1000).toISOString(),
    channelType: CHAT_CHANNEL_TYPE,
    channelId: chat.streamChannelId,
  };
}
export async function validateChatQuote(messageId: string | undefined, cid: string) {
  if (!messageId) return;
  const { message } = await streamServer().getMessage(messageId);
  if (message.cid !== cid || message.deleted_at || message.type === "deleted")
    throw new ChatError(
      "CHAT_QUOTE_UNAVAILABLE",
      "Сообщение для ответа недоступно в этом чате",
      403,
    );
}

export async function sendChatMessage(userId: string, input: unknown, chatId?: string) {
  const body = chatMessageSchema.parse(input);
  const chat = await requireCanSend(userId, chatId);
  await validateChatQuote(body.quotedMessageId, `${CHAT_CHANNEL_TYPE}:${chat.streamChannelId}`);
  const attachments = await prisma.chatAttachment.findMany({
    where: {
      id: { in: body.attachmentIds },
      chatId: chat.id,
      ownerUserId: userId,
      state: { in: ["READY", "ATTACHED"] },
    },
  });
  if (attachments.length !== new Set(body.attachmentIds).size)
    throw new ChatError("CHAT_ATTACHMENT_FORBIDDEN", "Недоступное вложение", 403);
  const payloadHash = hash(JSON.stringify(body));
  const op = await prisma.chatSendOperation
    .upsert({
      where: {
        senderUserId_clientMessageId: {
          senderUserId: userId,
          clientMessageId: body.clientMessageId,
        },
      },
      update: {},
      create: {
        chatId: chat.id,
        senderUserId: userId,
        clientMessageId: body.clientMessageId,
        streamMessageId: `msg-${hash(`${userId}/${body.clientMessageId}`)}`,
        payloadHash,
      },
    })
    .catch(async (error: unknown) => {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return prisma.chatSendOperation.findUniqueOrThrow({
        where: {
          senderUserId_clientMessageId: {
            senderUserId: userId,
            clientMessageId: body.clientMessageId,
          },
        },
      });
    });
  if (op.chatId !== chat.id || op.payloadHash !== payloadHash)
    throw new ChatError("CHAT_MESSAGE_CONFLICT", "Идентификатор уже занят другим сообщением", 409);
  if (op.state === "DELETED")
    throw new ChatError("CHAT_MESSAGE_DELETED", "Сообщение уже удалено", 409);
  if (op.state === "SENT") {
    // A completed send is never re-created after a hard deletion.
    try {
      return (await streamServer().getMessage(op.streamMessageId)).message;
    } catch (error) {
      if ((error as { code?: number }).code === 16)
        throw new ChatError("CHAT_MESSAGE_DELETED", "Сообщение уже удалено", 409);
      throw error;
    }
  }
  if (body.attachmentIds.length)
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.chatAttachment.updateMany({
        where: {
          id: { in: body.attachmentIds },
          chatId: chat.id,
          ownerUserId: userId,
          OR: [{ state: "READY" }, { state: "ATTACHED", operationId: op.id }],
        },
        data: { state: "ATTACHED", operationId: op.id },
      });
      if (claimed.count !== new Set(body.attachmentIds).size)
        throw new ChatError(
          "CHAT_ATTACHMENT_CONFLICT",
          "Вложение уже используется другим сообщением",
          409,
        );
    });
  const channel = streamServer().channel(CHAT_CHANNEL_TYPE, chat.streamChannelId);
  const result = await sendOnce(channel, {
    id: op.streamMessageId,
    user_id: uid(userId),
    text: body.text,
    ...(body.quotedMessageId ? { quoted_message_id: body.quotedMessageId } : {}),
    attachments: attachments.map((a) => ({
      type: a.kind,
      title: a.name,
      mime_type: a.mime,
      file_size: a.size,
      ...(a.kind === "image" ? { image_url: a.url } : { asset_url: a.url }),
    })),
  });
  await prisma.chatSendOperation.update({ where: { id: op.id }, data: { state: "SENT" } });
  return result.message;
}
export async function listChatDialogs(userId: string, cursor?: string) {
  if (!(await isAssignedChatTrainer(userId)))
    throw new ChatError("CHAT_FORBIDDEN", "Нет доступа", 403);
  const chats = await prisma.cynologistChat.findMany({
    where: { trainerUserId: userId, provisionStatus: "READY" },
    orderBy: [
      { unreadSince: { sort: "asc", nulls: "last" } },
      { lastMessageAt: "desc" },
      { id: "asc" },
    ],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = await Promise.all(
    chats.slice(0, 20).map(async (chat) => {
      const result = await streamServer()
        .channel(CHAT_CHANNEL_TYPE, chat.streamChannelId)
        .query({ state: true, messages: { limit: 1 } });
      const read = result.read?.find((r) => r.user.id === uid(userId));
      return dto(chat, read?.unread_messages ?? 0);
    }),
  );
  return { items, nextCursor: chats.length > 20 ? chats[19].id : null };
}
