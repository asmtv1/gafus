import { postChat2FileToS3 } from "./s3Upload";
import type { SignedClientPhotoPost } from "@/shared/lib/media/directPhotoUpload";
import type { Chat2MediaRenditions } from "@gafus/chat-media-quality";
import type { Chat2ConnectionGrant } from "@gafus/core-client/chat2/realtime-subscription";
import { API_BASE_URL } from "@/shared/config";
import { isPairedProductionChat2Origin } from "@/shared/lib/api/chat2ProductionOrigin";
import { apiClient } from "@/shared/lib/api/client";
import * as SecureStore from "expo-secure-store";
import { getMobileClientHeaders } from "@/shared/lib/api/client-context";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
export type Kind = "DIRECT" | "CYNOLOGIST" | "COMMUNITY" | "COURSE" | "CITY" | "BREED" | "GROUP" | "COURSE_TOPIC";
export type Member = { userId: string; username: string; role: string; avatarUrl?: string | null };
export type Attachment = {
  id: string;
  kind: "image" | "video" | "file";
  name: string;
  mime: string;
  bytes: number;
};
export type Message = {
  attachments: Attachment[];
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
export type Conversation = {
  id: string;
  kind: Kind;
  name: string | null;
  description: string | null;
  visibility: string;
  members: Member[];
  role: string;
  muted?: boolean;
  avatarUrl?: string | null;
  lastSequence: string;
  unreadCount: number;
  lastMessage: Message | null;
};
export type Group = {
  id: string;
  name: string;
  description: string | null;
  kind: Kind;
  avatarUrl?: string | null;
  memberCount: number;
  joined: boolean;
};
export type ChatUser = { id: string; username: string };
export type StaffChat2Report = {
  id: string;
  reason: "SPAM" | "ABUSE" | "OTHER";
  comment: string;
  createdAt: string;
  conversation: { id: string; kind: Kind; name: string | null };
  message: { id: string; authorId: string; text: string; deletedAt: string | null };
};
export type Chat2Report = {
  id: string;
  reason: "SPAM" | "ABUSE" | "OTHER";
  comment: string;
  createdAt: string;
  message: { id: string; authorId: string; text: string; deletedAt: string | null };
};
const safe = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("Недопустимый идентификатор");
  return id;
};
export function nameFor(c: Pick<Conversation, "kind" | "name" | "members">, userId: string) {
  return (
    c.name ||
    (c.kind === "CYNOLOGIST"
      ? "Чат с кинологом"
      : c.kind === "DIRECT"
        ? c.members.find((m) => m.userId !== userId)?.username || "Личный чат"
        : "Сообщество")
  );
}
function guardChat2Destination(): string {
  // Chat2 needs an explicit endpoint; production is allowed only alongside the production mobile API.
  const origin = process.env.EXPO_PUBLIC_CHAT2_API_ORIGIN;
  if (!origin) throw new Error("Chat 2.0: настройте адрес API чата");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Недопустимый адрес Chat 2.0");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (["api.gafus.ru", "gafus.ru"].includes(url.hostname) &&
      !isPairedProductionChat2Origin(url.origin, API_BASE_URL))
  )
    throw new Error("Chat 2.0: production разрешён только вместе с production API");
  if (
    url.protocol !== "https:" &&
    !(
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      url.protocol === "http:" &&
      (/^(127\.0\.0\.1|localhost|10\.0\.2\.2)$/.test(url.hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname))
    )
  )
    throw new Error("Для Chat 2.0 разрешено только изолированное окружение");
  return url.origin;
}
function guardActor() {
  guardChat2Destination();
  const state = useAuthStore.getState(),
    binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor = state.isAuthenticated && !state.isLoading ? state.user?.id : null;
  if (!actor || !binding || binding.principalId !== actor)
    throw new Error("Сессия не подтверждена");
  const epoch = binding.authEpoch;
  return () => {
    const now = useAuthStore.getState(),
      b = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      now.isAuthenticated &&
      !now.isLoading &&
      now.user?.id === actor &&
      b?.principalId === actor &&
      b.authEpoch === epoch
    );
  };
}
async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const guard = guardActor();
  const response = await apiClient<T>(`/api/v1/chats${path}`, {
    method,
    body,
    requestGuard: guard,
    skipAuthRefreshReplay: method !== "GET",
    suppressSubscriptionPaywall: true,
    chat2Origin: guardChat2Destination(),
  });
  if (!guard()) throw new Error("Сессия изменилась");
  if (!response.success || response.data === undefined)
    throw new Error(response.error ?? "Чат недоступен");
  return response.data;
}
/** No image/video bytes through Hono. This path is enabled only after
 * protected Refactor API, scoped S3 and the Cloud Jobs pass E2E validation. */
async function uploadChat2V2(
  id: string, asset: { uri: string; name: string; mime: string; size: number; posterPreviewUri?: string },
): Promise<Attachment> {
  const guard=guardActor();
  const base=`/${safe(id)}/media/v2`;
  const reservation=await request<{
    mediaId: string;
    upload: { method: "POST"; url: string; fields: Record<string, string> };
    posterUpload: SignedClientPhotoPost;
  }>(base + "/reserve", "POST", {name:asset.name,mime:asset.mime,bytes:asset.size});
  if(!guard() || !/^[a-f0-9-]{36}$/i.test(reservation.mediaId) ||
     reservation.upload.method!=="POST")throw Error("Сессия или разрешение загрузки изменились");
  const dest=new URL(reservation.upload.url);
  if(dest.protocol!=="https:" ||
     !["s3.cloud.ru","gafus-chat2-media-2026.s3.cloud.ru"].includes(dest.hostname) ||
     dest.username||dest.password||dest.hash)throw Error("Недопустимый адрес хранилища");
  const [{ prepareVideoPosterWebp }, { postClientWebp }] = await Promise.all([
    import("@/shared/lib/media/prepareVideoPosterWebp"),
    import("@/shared/lib/media/directPhotoUpload"),
  ]);
  const cover = await prepareVideoPosterWebp(asset.uri,asset.posterPreviewUri);
  try {
    if(!reservation.posterUpload || reservation.posterUpload.method!=="POST")
      throw Error("Сервер не подписал обложку видео");
    await Promise.all([
      postChat2FileToS3(dest.toString(),reservation.upload.fields,asset,guard),
      postClientWebp(reservation.posterUpload,cover,
        ["s3.cloud.ru","gafus-chat2-media-2026.s3.cloud.ru"]),
    ]);
  } finally { cover.dispose(); }
  if(!guard())throw Error("Сессия изменилась");
  await request(`${base}/${reservation.mediaId}/confirm`, "POST", {});
  // The server moves UPLOADED -> QUEUED only after the message is sent.
  // Attaching must happen immediately after confirmation: waiting for READY
  // here deadlocks the entire photo/video pipeline.
  const attached = await request<Attachment>(`${base}/${reservation.mediaId}/attach`, "POST", {});
  if (!guard()) throw Error("Сессия изменилась");
  return attached;
}

/** Device-encoded Chat2 360/1440 WebP: READY before attachment, no Photo Job. */
async function uploadChat2ClientPhoto(id: string, asset: {
  uri: string; name: string; mime: string; size: number; width: number; height: number;
}): Promise<Attachment> {
  const guard = guardActor();
  const base = `/${safe(id)}/media/v2`;
  // Lazy-load the encoder only for opted-in mobile image uploads. Read-only
  // Chat2/API access must not initialize Expo's native image runtime.
  const [{ prepareUploadWebpVariants }, { postClientWebp }] = await Promise.all([
    import("@/shared/lib/media/prepareUploadWebp"),
    import("@/shared/lib/media/directPhotoUpload"),
  ]);
  const variants = await prepareUploadWebpVariants(asset, { small: 360, medium: 1440 });
  try {
    if (!guard()) throw new Error("Сессия изменилась");
    const reserved = await request<{
      mediaId: string;
      upload: SignedClientPhotoPost;
      smallUpload: SignedClientPhotoPost;
    }>(`${base}/client-reserve`, "POST", {
      name: asset.name, mime: "image/webp", bytes: variants.medium.bytes,
    });
    if (!guard() || !reserved.smallUpload || !reserved.upload ||
        !/^[a-f0-9-]{36}$/i.test(reserved.mediaId))
      throw new Error("Не удалось подготовить загрузку готовых фото");
    const allowedHosts = ["s3.cloud.ru", "gafus-chat2-media-2026.s3.cloud.ru"];
    await Promise.all([
      postClientWebp(reserved.smallUpload, variants.small, allowedHosts),
      postClientWebp(reserved.upload, variants.medium, allowedHosts),
    ]);
    if (!guard()) throw new Error("Сессия изменилась");
    const confirmation = await request<{ mediaId: string; status: string }>(
      `${base}/${reserved.mediaId}/client-confirm`, "POST", {});
    if (confirmation.mediaId !== reserved.mediaId || confirmation.status !== "READY")
      throw new Error("Готовые варианты фотографии не подтверждены");
    const attached = await request<Attachment>(`${base}/${reserved.mediaId}/attach`, "POST", {});
    if (!guard()) throw new Error("Сессия изменилась");
    return attached;
  } finally {
    for (const item of Object.values(variants)) item.dispose();
  }
}

export const chat2 = {
  list: () => request<Conversation[]>(""),
  users: (q: string) => request<ChatUser[]>(`/users?q=${encodeURIComponent(q)}`),
  discover: (q: string) =>
    request<Group[]>(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover"),
  direct: (userId: string) =>
    request<{ conversationId: string }>("/direct", "POST", { userId: safe(userId) }),
  directByUsername: (username: string) => {
    if (!/^[A-Za-z0-9_-]{2,128}$/.test(username)) throw new Error("Недопустимое имя пользователя");
    return request<{ conversationId: string }>("/direct", "POST", { username });
  },
  cynologist: () => request<{ conversationId: string }>("/cynologist", "POST", {}),
  community: () => request<{ conversationId: string }>("/community", "POST", {}),
  courseOptions: () => request<{ id: string; name: string }[]>("/courses"),
  course: (courseId: string) =>
    request<{ conversationId: string }>(`/courses/${safe(courseId)}`, "POST", {}),
  create: (
    name: string,
    kind: "GROUP" | "CITY" | "BREED" | "COURSE_TOPIC",
    visibility: "PUBLIC" | "PRIVATE",
    description: string,
  ) =>
    request<{ conversationId: string }>("/groups", "POST", { name, kind, visibility, description }),
  join: (id: string) => request<{ conversationId: string }>(`/${safe(id)}/join`, "POST", {}),
  room: (id: string) => request<Conversation>(`/${safe(id)}`),
  messages: (id: string, before?: string) =>
    request<Message[]>(`/${safe(id)}/messages${before ? `?before=${before}` : ""}`),
  send: (
    id: string,
    text: string,
    clientMessageId: string,
    replyToId?: string,
    attachmentIds: string[] = [],
  ) =>
    request<Message>(`/${safe(id)}/messages`, "POST", {
      text,
      clientMessageId,
      attachmentIds,
      ...(replyToId ? { replyToId } : {}),
    }),
  edit: (id: string, messageId: string, text: string) =>
    request<Message>(`/${safe(id)}/messages/${safe(messageId)}`, "PATCH", { text }),
  remove: (id: string, messageId: string) =>
    request<{ deleted: boolean }>(`/${safe(id)}/messages/${safe(messageId)}`, "DELETE"),
  react: (id: string, messageId: string, emoji: string) =>
    request<{ messageId: string; emoji: string; active: boolean }>(
      `/${safe(id)}/messages/${safe(messageId)}/reaction`, "POST", { emoji },
    ),
  read: (id: string, sequence: string) =>
    request<{ lastReadSequence: string }>(`/${safe(id)}/read`, "POST", { sequence }),
  leave: (id: string) => request<{ left: boolean }>(`/${safe(id)}/leave`, "POST", {}),
  report: (
    id: string,
    messageId: string,
    data: { reason: "SPAM" | "ABUSE" | "OTHER"; comment?: string },
  ) =>
    request<{ reported: boolean; reportId: string }>(
      `/${safe(id)}/messages/${safe(messageId)}/report`,
      "POST",
      data,
    ),
  staffReports: () => request<StaffChat2Report[]>("/moderation/reports"),
  resolveStaffReport: (id: string, status: "RESOLVED" | "REJECTED") =>
    request<{ done: boolean }>(`/moderation/reports/${safe(id)}/resolve`, "POST", { status }),
  reports: (id: string) => request<Chat2Report[]>(`/${safe(id)}/reports`),
  resolveReport: (id: string, reportId: string, status: "RESOLVED" | "REJECTED") =>
    request<{ done: boolean }>(`/${safe(id)}/reports/${safe(reportId)}/resolve`, "POST", {
      status,
    }),
  mute: (id: string, muted: boolean) =>
    request<{ muted: boolean }>(`/${safe(id)}/mute`, "POST", { muted }),
  invite: (id: string, userId: string) =>
    request<{ conversationId: string }>(`/${safe(id)}/invite`, "POST", { userId: safe(userId) }),
  moderate: (id: string, userId: string, action: "BAN" | "UNBAN" | "KICK" | "PROMOTE" | "DEMOTE") =>
    request<{ done: boolean }>(`/${safe(id)}/moderate`, "POST", { userId: safe(userId), action }),
  transfer: (id: string, userId: string) =>
    request<{ ownerId: string }>(`/${safe(id)}/transfer-owner`, "POST", { userId: safe(userId) }),
  updateGroup: (
    id: string,
    data: { name?: string; description?: string; visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED" },
  ) => request<{ id: string }>(`/${safe(id)}/group`, "PATCH", data),
  connect: () => request<Chat2ConnectionGrant>("/realtime/connect"),
  media: (id: string, fileId: string) =>
    request<{ url: string; mime: string; name: string; expiresIn: number;
      renditions?: Chat2MediaRenditions;
      fallbackUrl?: string;
      fallbackRenditions?: Chat2MediaRenditions;
      status?: "UPLOADED" | "QUEUED" | "PROCESSING" | "FAILED" | "EXPIRED" | "READY";
    }>(
      `/${safe(id)}/attachments/${safe(fileId)}`,
    ),
  discard: (id: string, fileId: string) =>
    request<{ deleted: boolean }>(`/${safe(id)}/attachments/${safe(fileId)}`, "DELETE"),
  removeAvatar: (id: string) =>
    request<{ avatarUrl: null }>(`/${safe(id)}/avatar`, "DELETE"),
  setAvatar: async (
    id: string, asset: { uri: string; name: string; mime: string; size: number },
  ): Promise<{ avatarUrl: string | null }> => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(asset.mime) ||
        asset.size < 10 || asset.size > 5 * 1024 * 1024)
      throw new Error("Выберите JPG, PNG или WebP до 5 МБ");
    const guard = guardActor();
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token || !guard()) throw new Error("Сессия изменилась");
    const data = new FormData();
    data.append("file", { uri: asset.uri, name: asset.name, type: asset.mime } as unknown as Blob);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let response: Response;
    try {
      response = await fetch(`${guardChat2Destination()}/api/v1/chats/${safe(id)}/avatar`, {
        method: "POST", headers: { ...getMobileClientHeaders(), Authorization: `Bearer ${token}` },
        body: data, signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    if (!guard()) throw new Error("Сессия изменилась");
    const payload = await response.json().catch(() => null) as
      { success?: boolean; data?: { avatarUrl: string | null }; error?: string } | null;
    if (!response.ok || !payload?.success || !payload.data)
      throw new Error(payload?.error || "Не удалось установить аватарку");
    return payload.data;
  },
  upload: async (
    id: string,
    asset: { uri: string; name: string; mime: string; size: number; width?: number; height?: number },
  ): Promise<Attachment> => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"];
    const limit = asset.mime === "video/mp4" ? 100 : 10;
    if (!allowed.includes(asset.mime) || asset.size < 10 || asset.size > limit * 1024 * 1024)
      throw new Error("Разрешены JPG, PNG, WebP, PDF до 10 МБ и видео MP4 до 100 МБ");
    // Release builds must not upload through the legacy S3 adapter, which
    // deliberately accepts only isolated local development credentials.
    // The V2 server gate stays authoritative; do not downgrade on failure.
    const releaseBuild = typeof __DEV__ !== "undefined" && !__DEV__;
    const productionChat2 = isPairedProductionChat2Origin(
      process.env.EXPO_PUBLIC_CHAT2_API_ORIGIN ?? "", API_BASE_URL,
    );
    // Never send production attachments through the legacy local-only adapter.
    if ((releaseBuild || productionChat2) && asset.mime === "application/pdf")
      throw new Error("PDF в чате пока недоступен. Отправьте фото или видео.");
    if (asset.mime.startsWith("image/")) {
      if (!asset.width || !asset.height)
        throw Error("Для фото необходима обработка на устройстве");
      return uploadChat2ClientPhoto(id, { ...asset, width: asset.width, height: asset.height });
    }
    if ((releaseBuild || productionChat2 || process.env.EXPO_PUBLIC_CHAT2_MEDIA_V2 === "true") &&
        asset.mime !== "application/pdf")
      return uploadChat2V2(id, asset);
    const guard = guardActor();
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token || !guard()) throw new Error("Сессия изменилась");
    const data = new FormData();
    data.append("file", { uri: asset.uri, name: asset.name, type: asset.mime } as unknown as Blob);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), asset.mime === "video/mp4" ? 180000 : 60000);
    let result: Response;
    try {
      result = await fetch(`${guardChat2Destination()}/api/v1/chats/${safe(id)}/attachments`, {
        method: "POST",
        headers: { ...getMobileClientHeaders(), Authorization: `Bearer ${token}` },
        body: data,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!guard()) throw new Error("Сессия изменилась");
    const payload = (await result.json()) as {
      success?: boolean;
      data?: Attachment;
      error?: string;
    };
    if (!result.ok || !payload.success || !payload.data?.id)
      throw new Error(payload.error || "Не удалось загрузить вложение");
    return payload.data;
  },
};
