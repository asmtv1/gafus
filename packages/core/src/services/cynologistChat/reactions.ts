import { z } from "zod";
import { CHAT_REACTIONS } from "@gafus/consultation-shared";
import { requireCanSend } from "./service";
import { requireCommunityCanSend } from "./community";
import {
  CHAT_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_TYPE,
  COMMUNITY_CHANNEL_ID,
  ChatError,
  streamServer,
} from "./stream";

const schema = z.object({
  messageId: z.string().min(1).max(128),
  type: z
    .string()
    .refine(
      (type) => CHAT_REACTIONS.some((reaction) => reaction.type === type),
      "Неизвестная реакция",
    ),
  // Explicit set/remove makes retries idempotent instead of toggling twice.
  action: z.enum(["set", "remove"]),
});
export async function manageChatReaction(
  userId: string,
  input: unknown,
  chatId?: string,
  community = false,
) {
  const body = schema.parse(input);
  const channelType = community ? COMMUNITY_CHANNEL_TYPE : CHAT_CHANNEL_TYPE;
  const channelId = community
    ? (await requireCommunityCanSend(userId), COMMUNITY_CHANNEL_ID)
    : (await requireCanSend(userId, chatId)).streamChannelId;
  const server = streamServer();
  const { message } = await server.getMessage(body.messageId);
  if (message.cid !== `${channelType}:${channelId}`)
    throw new ChatError("CHAT_FORBIDDEN", "Нет доступа к сообщению", 403);
  if (message.deleted_at || message.type === "deleted" || message.type === "system")
    throw new ChatError("CHAT_MESSAGE_UNAVAILABLE", "Сообщение недоступно", 409);
  const channel = server.channel(channelType, channelId);
  const actor = `gafus-${userId}`;
  if (body.action === "remove") await channel.deleteReaction(body.messageId, body.type, actor);
  else
    await channel.sendReaction(
      body.messageId,
      { type: body.type, user_id: actor },
      { enforce_unique: true, skip_push: true },
    );
  return { messageId: body.messageId };
}
