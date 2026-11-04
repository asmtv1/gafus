import { apiRequest } from "../../shared/api/client";
import type { Chat2ConnectionGrant } from "@gafus/core-client/chat2/realtime-subscription";
export type Chat2Kind =
  | "DIRECT"
  | "CYNOLOGIST"
  | "COMMUNITY"
  | "COURSE"
  | "COURSE_TOPIC"
  | "CITY"
  | "BREED"
  | "GROUP";
export type Chat2Member = {
  userId: string; username: string; role: string; avatarUrl?: string | null;
};
export type Chat2Attachment = {
  id: string;
  kind: "image" | "video" | "file";
  mime: string;
  name: string;
  bytes: number;
};
export type Chat2Message = {
  attachments: Chat2Attachment[];
  id: string;
  conversationId: string;
  sequence: string;
  authorId: string;
  clientMessageId: string;
  text: string;
  replyToId: string | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};
export type Chat2Conversation = {
  id: string;
  kind: Chat2Kind;
  name: string | null;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
  role: string;
  avatarUrl?: string | null;
  muted?: boolean;
  members: Chat2Member[];
  lastSequence: string;
  unreadCount: number;
  lastMessage: Chat2Message | null;
};
export type Chat2Group = {
  id: string;
  kind: Chat2Kind;
  name: string;
  description: string | null;
  avatarUrl?: string | null;
  memberCount: number;
  joined: boolean;
};
export type Chat2User = { id: string; username: string };
const safe = /^[a-zA-Z0-9_-]{1,128}$/;
export const chatId = (value: string) => {
  if (!safe.test(value)) throw new Error("Недопустимый идентификатор");
  return value;
};
function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  json?: unknown,
  signal?: AbortSignal,
) {
  return apiRequest<T>(`/api/v1/chats${path}`, {
    method,
    browserAuth: true,
    ...(signal ? { signal } : {}),
    ...(json === undefined ? {} : { json }),
  });
}
/** 401/403/404 are terminal for this private Centrifugo channel; network
 * errors and 5xx must remain retryable. No private token is logged.
 */
export function isChat2RoomAccessDenied(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "status" in error &&
    typeof error.status === "number" && [401, 403, 404].includes(error.status),
  );
}
export async function refreshChat2RoomToken(id: string): Promise<string> {
  try {
    return (await request<{ token: string }>(`/${chatId(id)}/realtime`)).token;
  } catch (error) {
    if (isChat2RoomAccessDenied(error)) return "";
    throw error;
  }
}

/** Feature-gated upgrade: direct-to-S3 source, one Cloud Job, then a ready
 * attachment bound through the existing authenticated chat API. Never silently
 * downgrade after a V2 reservation or upload failure. */
async function uploadChat2V2(id: string, file: File): Promise<Chat2Attachment> {
  const base = `/${chatId(id)}/media/v2`;
  const reservation = await request<{
    mediaId: string;
    upload: { url: string; fields: Record<string, string>; method: "POST" };
  }>(base + "/reserve", "POST", { name: file.name, mime: file.type, bytes: file.size });
  if (!/^[a-f0-9-]{36}$/i.test(reservation.mediaId) ||
      reservation.upload.method !== "POST") throw Error("CHAT2_V2_INVALID_RESERVATION");
  const destination = new URL(reservation.upload.url);
  if (destination.protocol !== "https:" ||
      !["s3.cloud.ru", "gafus-chat2-media-2026.s3.cloud.ru"].includes(destination.hostname) ||
      destination.username || destination.password || destination.hash)
    throw Error("CHAT2_V2_INVALID_STORAGE_DESTINATION");
  const data = new FormData();
  for (const [key, value] of Object.entries(reservation.upload.fields)) data.append(key, value);
  data.append("file", file, file.name);
  const localRelay = import.meta.env.VITE_CHAT2_LOCAL_S3_RELAY === "true" &&
    window.location.hostname === "127.0.0.1" && window.location.port === "5174" &&
    destination.hostname === "s3.cloud.ru" &&
    destination.pathname === "/gafus-chat2-media-2026";
  const sent = await fetch(localRelay ? "/chat2-qa-s3-upload" : destination.toString(), {
    method: "POST", body: data, credentials: "omit", cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(180_000),
  });
  if (!sent.ok) throw Error("Не удалось отправить файл в хранилище");
  // Original is already in S3 and the durable task is QUEUED. Bind it to the
  // message immediately; Web/Mobile render processing state until READY.
  // The server still verifies membership, ownership and confirmed source.
  await request(`${base}/${reservation.mediaId}/confirm`, "POST", {});
  return request<Chat2Attachment>(`${base}/${reservation.mediaId}/attach`, "POST", {});
}

export const chat2Api = {
  list: () => request<Chat2Conversation[]>(""),
  discover: (q: string) =>
    request<Chat2Group[]>(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover"),
  users: (q: string) => request<Chat2User[]>(`/users?q=${encodeURIComponent(q)}`),
  direct: (userId: string) =>
    request<{ conversationId: string }>("/direct", "POST", { userId: chatId(userId) }),
  directByUsername: (username: string) => {
    if (!/^[A-Za-z0-9_-]{2,128}$/.test(username)) throw new Error("Недопустимое имя пользователя");
    // Direct rooms are uniquely keyed by both users on the backend, so a
    // timed-out create can be retried safely without a duplicate dialog.
    return request<{ conversationId: string }>(
      "/direct", "POST", { username }, AbortSignal.timeout(12_000),
    );
  },
  cynologist: () => request<{ conversationId: string }>("/cynologist", "POST", {}),
  community: () => request<{ conversationId: string }>("/community", "POST", {}),
  courseOptions: () => request<{ id: string; name: string }[]>("/courses"),
  course: (id: string) => request<{ conversationId: string }>(`/courses/${chatId(id)}`, "POST", {}),
  create: (
    name: string,
    kind: "GROUP" | "CITY" | "BREED" | "COURSE_TOPIC",
    visibility: "PUBLIC" | "PRIVATE",
    description: string,
  ) =>
    request<{ conversationId: string }>("/groups", "POST", { name, kind, visibility, description }),
  join: (id: string) => request<{ conversationId: string }>(`/${chatId(id)}/join`, "POST", {}),
  detail: (id: string) => request<Chat2Conversation>(`/${chatId(id)}`),
  messages: (id: string, cursor?: { before?: string; after?: string }) =>
    request<Chat2Message[]>(
      `/${chatId(id)}/messages${
        cursor?.before ? `?before=${cursor.before}` : cursor?.after ? `?after=${cursor.after}` : ""
      }`,
    ),
  send: (
    id: string,
    data: { clientMessageId: string; text: string; replyToId?: string; attachmentIds?: string[] },
  ) => request<Chat2Message>(`/${chatId(id)}/messages`, "POST", data),
  edit: (id: string, messageId: string, text: string) =>
    request<Chat2Message>(`/${chatId(id)}/messages/${chatId(messageId)}`, "PATCH", { text }),
  remove: (id: string, messageId: string) =>
    request<{ deleted: boolean }>(`/${chatId(id)}/messages/${chatId(messageId)}`, "DELETE"),
  react: (id: string, messageId: string, emoji: string) =>
    request<{ messageId: string; emoji: string; active: boolean }>(
      `/${chatId(id)}/messages/${chatId(messageId)}/reaction`, "POST", { emoji },
    ),
  read: (id: string, sequence: string) =>
    request<{ lastReadSequence: string }>(`/${chatId(id)}/read`, "POST", { sequence }),
  leave: (id: string) => request<{ left: boolean }>(`/${chatId(id)}/leave`, "POST", {}),
  connect: () => request<Chat2ConnectionGrant>("/realtime/connect"),
  subscription: (id: string) =>
    request<{ token: string; channel: string }>(`/${chatId(id)}/realtime`),
  block: (userId: string, blocked: boolean) =>
    request<{ blocked: boolean }>("/block", "POST", { userId: chatId(userId), blocked }),
  invite: (id: string, userId: string) =>
    request<{ conversationId: string }>(`/${chatId(id)}/invite`, "POST", {
      userId: chatId(userId),
    }),
  mute: (id: string, muted: boolean) =>
    request<{ muted: boolean }>(`/${chatId(id)}/mute`, "POST", { muted }),
  updateGroup: (
    id: string,
    data: { name?: string; description?: string; visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED" },
  ) =>
    request<{ id: string; name: string | null; description: string | null; visibility: string }>(
      `/${chatId(id)}/group`,
      "PATCH",
      data,
    ),
  moderate: (id: string, userId: string, action: "BAN" | "UNBAN" | "KICK" | "PROMOTE" | "DEMOTE") =>
    request<{ done: boolean }>(`/${chatId(id)}/moderate`, "POST", {
      userId: chatId(userId),
      action,
    }),
  transfer: (id: string, userId: string) =>
    request<{ ownerId: string }>(`/${chatId(id)}/transfer-owner`, "POST", {
      userId: chatId(userId),
    }),
  report: (
    id: string,
    messageId: string,
    data: { reason: "SPAM" | "ABUSE" | "OTHER"; comment?: string },
  ) =>
    request<{ reported: boolean; reportId: string }>(
      `/${chatId(id)}/messages/${chatId(messageId)}/report`,
      "POST",
      data,
    ),
  reports: (id: string) =>
    request<
      {
        id: string;
        reason: string;
        comment: string;
        createdAt: string;
        message: { id: string; authorId: string; text: string; deletedAt: string | null };
      }[]
    >(`/${chatId(id)}/reports`),
  resolveReport: (id: string, reportId: string, status: "RESOLVED" | "REJECTED") =>
    request<{ done: boolean }>(`/${chatId(id)}/reports/${chatId(reportId)}/resolve`, "POST", {
      status,
    }),
  staffReports: () =>
    request<
      {
        id: string;
        reason: string;
        comment: string;
        createdAt: string;
        conversation: { id: string; kind: Chat2Kind; name: string | null };
        message: { id: string; authorId: string; text: string; deletedAt: string | null };
      }[]
    >("/moderation/reports"),
  resolveStaffReport: (id: string, status: "RESOLVED" | "REJECTED") =>
    request<{ done: boolean }>(`/moderation/reports/${chatId(id)}/resolve`, "POST", { status }),
  mediaUrl: (id: string, attachmentId: string) =>
    request<{ url: string; mime: string; name: string; expiresIn: number;
      status?: "READY" | "QUEUED" | "PROCESSING" | "FAILED" | "EXPIRED";
      renditions?: import("@gafus/chat-media-quality").Chat2MediaRenditions;
      fallbackUrl?: string;
      fallbackRenditions?: import("@gafus/chat-media-quality").Chat2MediaRenditions }>(
      `/${chatId(id)}/attachments/${chatId(attachmentId)}`,
    ),
  discard: (id: string, attachmentId: string) =>
    request<{ deleted: boolean }>(`/${chatId(id)}/attachments/${chatId(attachmentId)}`, "DELETE"),
  setAvatar: async (id: string, file: File): Promise<{ avatarUrl: string | null }> => {
    if (file.size < 10 || file.size > 5 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("Выберите JPG, PNG или WebP до 5 МБ");
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await fetch(`/api/v1/chats/${chatId(id)}/avatar`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie" },
      body,
    });
    const payload = await response.json().catch(() => null) as
      { success?: boolean; data?: { avatarUrl: string | null }; error?: string } | null;
    if (!response.ok || !payload?.success || !payload.data)
      throw new Error(payload?.error || "Не удалось установить аватарку");
    return payload.data;
  },
  removeAvatar: (id: string) => request<{ avatarUrl: null }>(`/${chatId(id)}/avatar`, "DELETE"),
  upload: async (id: string, file: File): Promise<Chat2Attachment> => {
    const limit = file.type === "video/mp4" ? 100 : 10;
    if (file.size > limit * 1024 * 1024 || file.size < 10)
      throw new Error("Видео — до 100 МБ, фото и PDF — до 10 МБ");
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"];
    if (!allowed.includes(file.type)) throw new Error("Разрешены JPG, PNG, WebP, PDF и видео MP4");
    // Production must never fall back to the legacy S3 handler: it is
    // intentionally restricted to local isolated storage. A build without
    // VITE_CHAT2_MEDIA_V2 still uses the activated V2 API for photos/videos.
    // The API remains the source of truth and fails closed if V2 is off.
    if (import.meta.env.PROD && file.type === "application/pdf")
      throw new Error("PDF в чате пока недоступен. Отправьте фото или видео.");
    if ((import.meta.env.PROD || import.meta.env.VITE_CHAT2_MEDIA_V2 === "true") &&
        file.type !== "application/pdf")
      return uploadChat2V2(id, file);
    const data = new FormData();
    data.append("file", file, file.name);
    const response = await fetch(`/api/v1/chats/${chatId(id)}/attachments`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie" },
      body: data,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      !("success" in payload) ||
      payload.success !== true ||
      !("data" in payload) ||
      !payload.data ||
      typeof payload.data !== "object" ||
      !("id" in payload.data) ||
      typeof (payload.data as { id?: unknown }).id !== "string"
    )
      throw new Error("Не удалось загрузить вложение");
    const dataPayload = payload.data as Partial<Chat2Attachment>;
    return dataPayload as Chat2Attachment;
  },
};
