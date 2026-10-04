import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { chatMessageSchema, sendOnce, validateChatQuote } from "./service";
import {
  COMMUNITY_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_ID,
  CHAT_STREAM_ROLE,
  ChatError,
  streamServer,
  verifyChatPermissions,
} from "./stream";

export function communityChatEnabled() {
  return process.env.COMMUNITY_CHAT_ENABLED === "true";
}
export async function communityActor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, profile: { select: { avatarUrl: true } } },
  });
  if (!user) throw new ChatError("CHAT_UNAUTHORIZED", "Войдите в приложение", 401);
  return user;
}
export async function getCommunityChatState(userId: string) {
  const user = await communityActor(userId);
  const isBanned = communityChatEnabled() ? await communityUserBanned(userId) : false;
  return {
    enabled: communityChatEnabled(),
    canSend: communityChatEnabled() && !isBanned,
    isBanned,
    isModerator: isCommunityModerator(user),
  };
}
export async function requireCommunityCanSend(userId: string) {
  const user = await communityActor(userId);
  if (!communityChatEnabled())
    throw new ChatError("CHAT_DISABLED", "Общий чат пока недоступен", 503);
  if (await communityUserBanned(userId))
    throw new ChatError("CHAT_BANNED", "Вы заблокированы в общем чате", 403);
  return { id: COMMUNITY_CHANNEL_ID, streamChannelId: COMMUNITY_CHANNEL_ID, user };
}
export async function getCommunityChatSession(userId: string) {
  const user = await communityActor(userId);
  if (!communityChatEnabled())
    throw new ChatError("CHAT_DISABLED", "Общий чат пока недоступен", 503);
  await verifyChatPermissions(COMMUNITY_CHANNEL_TYPE);
  const server = streamServer();
  await server.upsertUser({
    id: `gafus-${userId}`,
    role: CHAT_STREAM_ROLE,
    name: user.username,
    image: user.profile?.avatarUrl ?? "",
  });
  // Read-only watchers keep a public room independent of private-dialog membership.
  const channel = server.channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID, {
    created_by_id: `gafus-${userId}`,
  });
  await channel.create();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    apiKey: server.key,
    userId: `gafus-${userId}`,
    token: server.createToken(`gafus-${userId}`, expires),
    expiresAt: new Date(expires * 1000).toISOString(),
    channelType: COMMUNITY_CHANNEL_TYPE,
    channelId: COMMUNITY_CHANNEL_ID,
  };
}
export async function sendCommunityChatMessage(userId: string, input: unknown) {
  const body = chatMessageSchema.parse(input);
  await requireCommunityCanSend(userId);
  await validateChatQuote(
    body.quotedMessageId,
    `${COMMUNITY_CHANNEL_TYPE}:${COMMUNITY_CHANNEL_ID}`,
  );
  const files = await prisma.communityChatAttachment.findMany({
    where: {
      id: { in: body.attachmentIds },
      ownerUserId: userId,
      state: { in: ["READY", "ATTACHED"] },
    },
  });
  if (files.length !== new Set(body.attachmentIds).size)
    throw new ChatError("CHAT_ATTACHMENT_FORBIDDEN", "Недоступное вложение", 403);
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const payloadHash = hash(JSON.stringify(body));
  const op = await prisma.communityChatSendOperation
    .upsert({
      where: {
        senderUserId_clientMessageId: {
          senderUserId: userId,
          clientMessageId: body.clientMessageId,
        },
      },
      update: {},
      create: {
        senderUserId: userId,
        clientMessageId: body.clientMessageId,
        streamMessageId: `community-${hash(`${userId}/${body.clientMessageId}`)}`,
        payloadHash,
      },
    })
    .catch(async (error: unknown) => {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return prisma.communityChatSendOperation.findUniqueOrThrow({
        where: {
          senderUserId_clientMessageId: {
            senderUserId: userId,
            clientMessageId: body.clientMessageId,
          },
        },
      });
    });
  if (op.payloadHash !== payloadHash)
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
      const claimed = await tx.communityChatAttachment.updateMany({
        where: {
          id: { in: body.attachmentIds },
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
  const result = await sendOnce(
    streamServer().channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID),
    {
      id: op.streamMessageId,
      user_id: `gafus-${userId}`,
      text: body.text,
      ...(body.quotedMessageId ? { quoted_message_id: body.quotedMessageId } : {}),
      attachments: files.map((file) => ({
        type: file.kind,
        title: file.name,
        mime_type: file.mime,
        file_size: file.size,
        ...(file.kind === "image" ? { image_url: file.url } : { asset_url: file.url }),
      })),
    },
  );
  await prisma.communityChatSendOperation.update({ where: { id: op.id }, data: { state: "SENT" } });
  return result.message;
}

const communityCid = `${COMMUNITY_CHANNEL_TYPE}:${COMMUNITY_CHANNEL_ID}`;
export function isCommunityModerator(user: { username: string; role: string }) {
  return user.username === "admin" && user.role === "ADMIN";
}
async function communityUserBanned(userId: string) {
  const { bans } = await streamServer().queryBannedUsers(
    { channel_cid: communityCid, user_id: `gafus-${userId}` },
    [],
    { limit: 1, exclude_expired_bans: true },
  );
  if (!bans) throw new ChatError("CHAT_UNAVAILABLE", "Не удалось проверить блокировку", 503);
  return bans.length > 0;
}
async function requireModerator(userId: string) {
  const user = await communityActor(userId);
  if (!isCommunityModerator(user)) throw new ChatError("CHAT_FORBIDDEN", "Недостаточно прав", 403);
  if (!communityChatEnabled())
    throw new ChatError("CHAT_DISABLED", "Общий чат пока недоступен", 503);
  return user;
}
export async function communityModerationOverview(userId: string, cursor?: string) {
  await requireModerator(userId);
  const before = cursor
    ? z
        .string()
        .max(128)
        .regex(/^[\w-]+$/)
        .parse(cursor)
    : undefined;
  const [room, blocked] = await Promise.all([
    streamServer()
      .channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID)
      .query({ messages: { limit: 30, ...(before ? { id_lt: before } : {}) } }),
    streamServer().queryBannedUsers({ channel_cid: communityCid }, [{ created_at: -1 }], {
      limit: 100,
      exclude_expired_bans: true,
    }),
  ]);
  const messages = (room.messages ?? [])
    .filter((m) => !m.deleted_at)
    .map((m) => ({
      id: m.id,
      userId: m.user?.id ?? "",
      username: m.user?.name ?? m.user?.id ?? "Участник",
      text: m.text || "Фото или видео",
      createdAt: m.created_at,
    }));
  return {
    messages: messages.reverse(),
    cursor: (room.messages?.length ?? 0) === 30 ? room.messages?.[0]?.id : null,
    bans: (blocked.bans ?? []).map((b) => ({
      userId: b.user.id,
      username: b.user.name ?? b.user.id,
    })),
  };
}
const moderationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), messageId: z.string().min(1).max(128) }),
  z.object({ action: z.literal("ban"), userId: z.string().min(1).max(160) }),
  z.object({ action: z.literal("unban"), userId: z.string().min(1).max(160) }),
]);
export async function moderateCommunityChat(userId: string, input: unknown) {
  const moderator = await requireModerator(userId);
  const body = moderationSchema.parse(input);
  const server = streamServer();
  if (body.action === "delete") {
    const { message } = await server.getMessage(body.messageId);
    if (message.cid !== communityCid)
      throw new ChatError("CHAT_FORBIDDEN", "Сообщение не из общего чата", 403);
    await server.deleteMessage(body.messageId); // Soft deletion preserves the moderation audit trail.
    return null;
  }
  if (!body.userId.startsWith("gafus-")) throw new ChatError("INVALID_INPUT", "Неверный участник");
  const target = await communityActor(body.userId.slice(6));
  if (isCommunityModerator(target) || target.id === moderator.id)
    throw new ChatError("CHAT_FORBIDDEN", "Модератора нельзя заблокировать", 403);
  await server.upsertUser({
    id: `gafus-${moderator.id}`,
    name: moderator.username,
    role: CHAT_STREAM_ROLE,
  });
  const room = server.channel(COMMUNITY_CHANNEL_TYPE, COMMUNITY_CHANNEL_ID);
  if (body.action === "ban")
    await room.banUser(body.userId, {
      banned_by_id: `gafus-${moderator.id}`,
      reason: "Нарушение правил общего чата",
    });
  else await room.unbanUser(body.userId);
  return null;
}
