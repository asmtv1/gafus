import { CHAT_LIMITS, ownChatMessageActions } from "@gafus/consultation-shared";
import { prisma } from "@gafus/prisma";
import { z } from "zod";
import { chatForActor } from "./service";
import { requireCommunityCanSend } from "./community";
import {
  CHAT_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_ID,
  ChatError,
  requireChatSending,
  streamServer,
} from "./stream";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    messageId: z.string().min(1).max(128),
    text: z.string().trim().max(CHAT_LIMITS.textLength),
  }),
  z.object({ action: z.literal("delete"), messageId: z.string().min(1).max(128) }),
]);

export async function manageOwnChatMessage(
  userId: string,
  input: unknown,
  chatId?: string,
  community = false,
) {
  const body = schema.parse(input);
  let expectedCid: string;
  if (community) {
    await requireCommunityCanSend(userId);
    expectedCid = `${COMMUNITY_CHANNEL_TYPE}:${COMMUNITY_CHANNEL_ID}`;
  } else {
    requireChatSending();
    const chat = await chatForActor(userId, chatId);
    if (chat.firstMessageId === body.messageId)
      throw new ChatError("CHAT_MESSAGE_UNAVAILABLE", "Анкета диалога не редактируется", 403);
    expectedCid = `${CHAT_CHANNEL_TYPE}:${chat.streamChannelId}`;
  }
  const server = streamServer();
  const { message } = await server.getMessage(body.messageId);
  if (message.cid !== expectedCid || message.user?.id !== `gafus-${userId}`)
    throw new ChatError("CHAT_FORBIDDEN", "Можно изменять только свои сообщения в этом чате", 403);
  if (message.deleted_at || message.type === "deleted" || message.type === "system")
    throw new ChatError("CHAT_MESSAGE_UNAVAILABLE", "Сообщение недоступно", 409);
  const actions = ownChatMessageActions(
    {
      id: message.id,
      authorId: message.user?.id,
      type: message.type,
      deletedAt: message.deleted_at,
      createdAt: message.created_at,
    },
    `gafus-${userId}`,
  );
  if (!(body.action === "edit" ? actions.canEdit : actions.canDelete))
    throw new ChatError(
      "CHAT_MESSAGE_TIME_EXPIRED",
      body.action === "edit"
        ? "Редактирование доступно в течение 15 минут после отправки"
        : "Удаление доступно в течение 24 часов после отправки",
      403,
    );
  if (body.action === "edit") {
    if (!body.text && !message.attachments?.length)
      throw new ChatError("INVALID_INPUT", "Сообщение не может быть пустым");
    await server.partialUpdateMessage(
      body.messageId,
      { set: { text: body.text } },
      `gafus-${userId}`,
    );
  } else {
    // Keep a tombstone so retrying the original send cannot recreate a hard-deleted message.
    const tombstone = {
      where: { streamMessageId: body.messageId, senderUserId: userId },
      data: { state: "DELETED" },
    };
    if (community) await prisma.communityChatSendOperation.updateMany(tombstone);
    else await prisma.chatSendOperation.updateMany(tombstone);
    await server.deleteMessage(body.messageId, { hardDelete: true });
  }
  return { messageId: body.messageId };
}
