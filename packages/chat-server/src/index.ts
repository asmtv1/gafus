import { connection } from "@gafus/queues";
import { ZodError } from "zod";
import {
  getChatState,
  startChat,
  getChatSession,
  sendChatMessage,
  listChatDialogs,
  ChatError,
  manageChatReaction,
  manageOwnChatMessage,
  communityModerationOverview,
  moderateCommunityChat,
  getCommunityChatState,
  getCommunityChatSession,
  sendCommunityChatMessage,
} from "@gafus/core/services/cynologistChat";
import { deleteChatAttachment } from "@gafus/core/services/cynologistChat/upload";
import { uploadChatAttachmentRequest } from "./upload.js";

export function chatHttpError(error: unknown) {
  if (error instanceof ChatError)
    return {
      status: error.status,
      body: { success: false, code: error.code, error: error.message },
    };
  if (error instanceof ZodError)
    return {
      status: 400,
      body: {
        success: false,
        code: "INVALID_INPUT",
        error: error.issues[0]?.message ?? "Проверьте поля",
      },
    };
  return {
    status: 503,
    body: {
      success: false,
      code: "CHAT_UNAVAILABLE",
      error: "Не удалось подключиться. Повторите попытку",
    },
  };
}
export async function dispatchChatRequest(
  userId: string,
  request: Request,
  action = "",
  community = false,
) {
  if (request.method !== "GET") {
    const bucket = action === "attachments" ? "upload" : action === "messages" ? "send" : "session";
    const limit =
      bucket === "upload" ? (community ? 5 : 10) : bucket === "send" ? (community ? 20 : 60) : 30;
    const key = `chat-rate:${community ? "community:" : ""}${userId}:${bucket}:${Math.floor(Date.now() / 60000)}`;
    const count = await connection.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n",
      1,
      key,
    );
    if (Number(count) > limit)
      throw new ChatError("CHAT_RATE_LIMIT", "Слишком много запросов. Подождите минуту", 429);
  }
  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId") ?? undefined;
  if (community && chatId) throw new ChatError("INVALID_INPUT", "Неверный диалог");
  if (chatId && (chatId.length > 128 || !/^[\w-]+$/.test(chatId)))
    throw new ChatError("INVALID_INPUT", "Неверный диалог");
  if (community && request.method === "GET" && action === "moderation")
    return communityModerationOverview(userId, url.searchParams.get("cursor") ?? undefined);
  if (request.method === "GET" && !action)
    return community ? getCommunityChatState(userId) : getChatState(userId, chatId);
  if (!community && request.method === "GET" && action === "dialogs")
    return listChatDialogs(userId, url.searchParams.get("cursor") ?? undefined);
  if (request.method === "POST" && action === "session")
    return community ? getCommunityChatSession(userId) : getChatSession(userId, chatId);
  if (request.method === "POST" && action === "attachments") {
    const a = await uploadChatAttachmentRequest(userId, request, chatId, community);
    return { id: a.id, kind: a.kind, name: a.name };
  }
  if (request.method === "DELETE" && action === "attachments") {
    await deleteChatAttachment(
      userId,
      url.searchParams.get("attachmentId") ?? "",
      chatId,
      community,
    );
    return null;
  }
  if (
    request.method === "POST" &&
    (action === "reactions" ||
      action === "message-actions" ||
      action === "messages" ||
      (community && action === "moderation") ||
      (!community && action === "start"))
  ) {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 32768) {
            await reader.cancel();
            throw new ChatError("INVALID_INPUT", "Слишком большой запрос");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ChatError("INVALID_INPUT", "Неверный JSON");
    }
    if (action === "reactions") return manageChatReaction(userId, body, chatId, community);
    if (action === "message-actions") return manageOwnChatMessage(userId, body, chatId, community);
    if (community && action === "moderation") return moderateCommunityChat(userId, body);
    return community
      ? sendCommunityChatMessage(userId, body)
      : action === "start"
        ? startChat(userId, body)
        : sendChatMessage(userId, body, chatId);
  }
  throw new ChatError("NOT_FOUND", "Не найдено", 404);
}
