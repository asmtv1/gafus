import { StreamChat } from "stream-chat";

export const CHAT_CHANNEL_TYPE = "gafus_cynologist";
export const COMMUNITY_CHANNEL_TYPE = "gafus_community";
export const COMMUNITY_CHANNEL_ID = "general";
export const CHAT_STREAM_ROLE = "gafus_chat_reader";
export class ChatError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function chatEnabled() {
  return process.env.CYNOLOGIST_CHAT_ENABLED === "true";
}
export function requireChatSending() {
  if (!chatEnabled()) throw new ChatError("CHAT_DISABLED", "Чат временно недоступен", 503);
}
export function streamServer() {
  const key = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) throw new ChatError("CHAT_UNAVAILABLE", "Чат временно недоступен", 503);
  return StreamChat.getInstance(key, secret);
}
const allowed = new Set([
  "read-channel",
  "read-channel-members",
  "send-event",
  "send-typing-event",
]);
/** Refuse tokens if the remotely configured policy could bypass GAFUS. No grant mutations at runtime. */
export async function verifyChatPermissions(channelType = CHAT_CHANNEL_TYPE) {
  const client = streamServer();
  const [type, app] = await Promise.all([
    client.getChannelType(channelType),
    client.getAppSettings(),
  ]);
  const memberGrants = type.grants?.channel_member;
  if (
    !memberGrants ||
    memberGrants.some((grant) => !allowed.has(grant)) ||
    !memberGrants.includes("read-channel") ||
    (channelType === COMMUNITY_CHANNEL_TYPE
      ? !(type.grants?.[CHAT_STREAM_ROLE] ?? []).includes("read-channel") ||
        (type.grants?.[CHAT_STREAM_ROLE] ?? []).some((grant) => !allowed.has(grant))
      : (type.grants?.[CHAT_STREAM_ROLE] ?? []).length)
  ) {
    throw new ChatError("CHAT_PERMISSIONS_UNSAFE", "Чат временно недоступен", 503);
  }
  if (
    app.app?.disable_auth_checks ||
    app.app?.disable_permissions_checks ||
    (app.app?.grants?.[CHAT_STREAM_ROLE] ?? []).length ||
    type.connect_events !== true ||
    type.read_events !== true
  ) {
    throw new ChatError("CHAT_PERMISSIONS_UNSAFE", "Чат временно недоступен", 503);
  }
}
