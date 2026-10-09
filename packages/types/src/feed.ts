/** Shared platform-neutral contracts for the authenticated GAFUS publication feed. */
export const FEED_LIMITS = {
  postCharacters: 5_000,
  commentCharacters: 2_000,
  maxAttachments: 10,
  maxVideos: 3,
  videoSeconds: 60,
  videoBytes: 200 * 1024 * 1024,
  photoBytes: 10 * 1024 * 1024,
  photoPixels: 50_000_000,
  editSeconds: 60 * 60,
  pageSize: 20,
  maxPageSize: 50,
  uploadUrlSeconds: 600,
  reservationSeconds: 900,
  mediaUrlSeconds: 120,
  pendingDraftSeconds: 24 * 60 * 60,
  reactionBatchSeconds: 10 * 60,
  viewVisibleFraction: 0.5,
  viewVisibleMilliseconds: 2_000,
  maxRequestBytes: 64 * 1024,
  hlsSegmentMaxBytes: 1_750_000,
} as const;

export const FEED_REACTIONS = ["❤️", "😂", "🐶", "🔥", "👍"] as const;
export const FEED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FEED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export type FeedReaction = (typeof FEED_REACTIONS)[number];
export type FeedMediaKind = "photo" | "video";
export type FeedPostStatus = "draft" | "pending" | "published" | "failed" | "deleted";
export type FeedRevisionStatus = "draft" | "pending" | "ready" | "failed" | "superseded";
export type FeedMediaStatus = "reserved" | "uploaded" | "processing" | "ready" | "failed" | "cancelled" | "expired";
export type FeedNotificationKind = "comment" | "reply" | "post_reaction" | "comment_reaction";
export type FeedMimeType =
  | (typeof FEED_PHOTO_MIME_TYPES)[number]
  | (typeof FEED_VIDEO_MIME_TYPES)[number];

export interface FeedAuthorDto {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface FeedReactionCountDto {
  emoji: FeedReaction;
  count: number;
}

export interface FeedMediaDto {
  id: string;
  kind: FeedMediaKind;
  position: number;
  status: FeedMediaStatus;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbUrl: string | null;
  fullUrl: string | null;
  posterUrl: string | null;
  urlsExpireAt: string | null;
  /** Only returned for the owner in editor/pending responses. */
  errorCode?: string | null;
  errorMessage?: string | null;
  uploadId?: string | null;
}

export interface FeedPostDto {
  id: string;
  author: FeedAuthorDto;
  status: FeedPostStatus;
  text: string;
  attachments: FeedMediaDto[];
  createdAt: string;
  publishedAt: string | null;
  editedAt: string | null;
  editUntil: string | null;
  version: number;
  reactions: FeedReactionCountDto[];
  myReaction: FeedReaction | null;
  viewCount: number;
  commentCount: number;
  canEdit: boolean;
  canDelete: boolean;
  /** Optional only for detailed post/editor responses that include a server clock. */
  serverNow?: string;
}

export interface FeedPostEditorDto extends FeedPostDto {
  pendingRevision: {
    id: string;
    status: FeedRevisionStatus;
    text: string;
    attachmentIds: string[];
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
}

export interface FeedCommentDto {
  id: string;
  postId: string;
  author: FeedAuthorDto;
  text: string;
  createdAt: string;
  editedAt: string | null;
  editUntil: string;
  rootId: string | null;
  replyToId: string | null;
  replyToName: string | null;
  deleted: boolean;
  replyCount: number;
  reactions: FeedReactionCountDto[];
  myReaction: FeedReaction | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface FeedNotificationDto {
  id: string;
  kind: FeedNotificationKind;
  postId: string;
  commentId: string | null;
  actors: FeedAuthorDto[];
  reaction: FeedReaction | null;
  actorCount: number;
  createdAt: string;
  readAt: string | null;
  targetAvailable: boolean;
}

export interface FeedPageDto<T> {
  items: T[];
  nextCursor: string | null;
  serverNow: string;
}

export type FeedPostPageDto = FeedPageDto<FeedPostDto>;
export type FeedCommentPageDto = FeedPageDto<FeedCommentDto>;
export type FeedNotificationPageDto = FeedPageDto<FeedNotificationDto>;
export interface FeedReactionUserDto {
  user: FeedAuthorDto;
  reaction: FeedReaction;
  reactedAt: string;
}
export interface FeedReactionUserPageDto extends FeedPageDto<FeedReactionUserDto> {
  counts: FeedReactionCountDto[];
}

export interface FeedUploadDto {
  uploadId: string;
  postId: string;
  mediaId: string;
  status: FeedMediaStatus;
  postUrl: string | null;
  postFields: Record<string, string> | null;
  urlExpiresAt: string | null;
  reservationExpiresAt: string;
  media: FeedMediaDto | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface FeedErrorDto {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

export interface FeedListQuery {
  cursor?: string | null;
  pageSize?: number;
}

export interface FeedPostCreateInput {
  clientRequestId: string;
}

export interface FeedRevisionInput {
  clientRequestId: string;
  expectedVersion: number;
  text: string;
  /** Ordered IDs; all must belong to the same post. */
  attachmentIds: string[];
}

export interface FeedPublishInput {
  clientRequestId: string;
}

export interface FeedReserveUploadInput {
  filename: string;
  kind: FeedMediaKind;
  declaredMime: FeedMimeType;
  declaredBytes: number;
  clientRequestId: string;
}

export interface FeedCopyAlbumPhotoInput {
  photoId: string;
  clientRequestId: string;
}

export interface FeedUploadRetryInput {
  clientRequestId: string;
}

export interface FeedCommentInput {
  text: string;
  replyToId?: string | null;
  clientRequestId: string;
}

export interface FeedCommentEditInput {
  text: string;
}

export interface FeedSetReactionInput {
  reaction: FeedReaction;
}

export interface FeedPlaybackTicketDto {
  ticket: string;
  /** Relative, short-lived bearer URL for native HLS. Never persist this URL. */
  manifestUrl: string;
  expiresAt: string;
}

export interface FeedPlaybackManifestDto {
  playlist: string;
  expiresAt: string;
}

/** Caller-provided transport attaches the current user's session+CSRF or JWT. */
export type FeedTransport = <T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  },
) => Promise<T>;

const encodeId = encodeURIComponent;
function feedQuery(query: FeedListQuery & { reaction?: FeedReaction } = {}): string {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  if (query.reaction !== undefined) params.set("reaction", query.reaction);
  return params.size ? `?${params.toString()}` : "";
}

/** Paths are relative to /api/v1/feed, never directly to the underlying storage. */
export function createFeedClient(transport: FeedTransport) {
  return {
    status: () => transport<{ enabled: boolean }>("status"),
    listPosts: (query?: FeedListQuery) => transport<FeedPostPageDto>(`posts${feedQuery(query)}`),
    listProfilePosts: (username: string, query?: FeedListQuery) =>
      transport<FeedPostPageDto>(`profiles/${encodeId(username)}/posts${feedQuery(query)}`),
    listPendingPosts: (query?: FeedListQuery) =>
      transport<FeedPostPageDto>(`me/pending-posts${feedQuery(query)}`),
    createPost: (body: FeedPostCreateInput) =>
      transport<FeedPostEditorDto>("posts", { method: "POST", body }),
    getPost: (postId: string) => transport<FeedPostDto>(`posts/${encodeId(postId)}`),
    getEditor: (postId: string) =>
      transport<FeedPostEditorDto>(`posts/${encodeId(postId)}/editor`),
    saveRevision: (postId: string, body: FeedRevisionInput) =>
      transport<FeedPostEditorDto>(`posts/${encodeId(postId)}/revisions`, {
        method: "PUT",
        body,
      }),
    publishPost: (postId: string, body: FeedPublishInput) =>
      transport<FeedPostEditorDto>(`posts/${encodeId(postId)}/publish`, {
        method: "POST",
        body,
      }),
    deletePost: (postId: string) =>
      transport<{ id: string }>(`posts/${encodeId(postId)}`, { method: "DELETE" }),
    reserveUpload: (postId: string, body: FeedReserveUploadInput) =>
      transport<FeedUploadDto>(`posts/${encodeId(postId)}/uploads`, { method: "POST", body }),
    copyAlbumPhoto: (postId: string, body: FeedCopyAlbumPhotoInput) =>
      transport<FeedMediaDto>(`posts/${encodeId(postId)}/album-copies`, {
        method: "POST",
        body,
      }),
    getUpload: (uploadId: string) => transport<FeedUploadDto>(`uploads/${encodeId(uploadId)}`),
    completeUpload: (uploadId: string) =>
      transport<FeedUploadDto>(`uploads/${encodeId(uploadId)}/complete`, {
        method: "POST",
        body: {},
      }),
    cancelUpload: (uploadId: string) =>
      transport<FeedUploadDto>(`uploads/${encodeId(uploadId)}`, { method: "DELETE" }),
    retryUpload: (uploadId: string, body: FeedUploadRetryInput) =>
      transport<FeedUploadDto>(`uploads/${encodeId(uploadId)}/retry`, {
        method: "POST",
        body,
      }),
    getComment: (commentId: string) =>
      transport<FeedCommentDto>(`comments/${encodeId(commentId)}`),
    listComments: (postId: string, query?: FeedListQuery) =>
      transport<FeedCommentPageDto>(`posts/${encodeId(postId)}/comments${feedQuery(query)}`),
    listReplies: (commentId: string, query?: FeedListQuery) =>
      transport<FeedCommentPageDto>(`comments/${encodeId(commentId)}/replies${feedQuery(query)}`),
    createComment: (postId: string, body: FeedCommentInput) =>
      transport<FeedCommentDto>(`posts/${encodeId(postId)}/comments`, {
        method: "POST",
        body,
      }),
    editComment: (commentId: string, body: FeedCommentEditInput) =>
      transport<FeedCommentDto>(`comments/${encodeId(commentId)}`, {
        method: "PATCH",
        body,
      }),
    deleteComment: (commentId: string) =>
      transport<{ id: string }>(`comments/${encodeId(commentId)}`, { method: "DELETE" }),
    setPostReaction: (postId: string, reaction: FeedReaction) =>
      transport<FeedPostDto>(`posts/${encodeId(postId)}/reaction`, {
        method: "PUT",
        body: { reaction } satisfies FeedSetReactionInput,
      }),
    removePostReaction: (postId: string) =>
      transport<FeedPostDto>(`posts/${encodeId(postId)}/reaction`, { method: "DELETE" }),
    listPostReactions: (postId: string, query?: FeedListQuery & { reaction?: FeedReaction }) =>
      transport<FeedReactionUserPageDto>(
        `posts/${encodeId(postId)}/reactions${feedQuery(query)}`,
      ),
    setCommentReaction: (commentId: string, reaction: FeedReaction) =>
      transport<FeedCommentDto>(`comments/${encodeId(commentId)}/reaction`, {
        method: "PUT",
        body: { reaction } satisfies FeedSetReactionInput,
      }),
    removeCommentReaction: (commentId: string) =>
      transport<FeedCommentDto>(`comments/${encodeId(commentId)}/reaction`, {
        method: "DELETE",
      }),
    listCommentReactions: (commentId: string, query?: FeedListQuery & { reaction?: FeedReaction }) =>
      transport<FeedReactionUserPageDto>(
        `comments/${encodeId(commentId)}/reactions${feedQuery(query)}`,
      ),
    recordView: (postId: string) =>
      transport<{ counted: boolean; viewCount: number }>(`posts/${encodeId(postId)}/views`, {
        method: "POST",
        body: {},
      }),
    requestPlayback: (mediaId: string) =>
      transport<FeedPlaybackTicketDto>(`media/${encodeId(mediaId)}/playback`, {
        method: "POST",
        body: {},
      }),
    getPlaybackManifest: (mediaId: string, ticket: string) =>
      transport<FeedPlaybackManifestDto>(
        `media/${encodeId(mediaId)}/manifest?ticket=${encodeURIComponent(ticket)}`,
      ),
    listNotifications: (query?: FeedListQuery) =>
      transport<FeedNotificationPageDto>(`notifications${feedQuery(query)}`),
    unreadCount: () => transport<{ count: number }>("notifications/unread-count"),
    markNotificationRead: (notificationId: string) =>
      transport<{ id: string; readAt: string }>(`notifications/${encodeId(notificationId)}`, {
        method: "PATCH",
        body: { read: true },
      }),
    markAllNotificationsRead: () =>
      transport<{ count: number }>("notifications/read-all", { method: "POST", body: {} }),
  };
}

/** Unicode code-point count instead of JS UTF-16 length (emoji count consistently). */
export function countFeedCharacters(value: string): number {
  return Array.from(value).length;
}

/** Helpful shared UI preflight; core must independently validate every request. */
export function getFeedCompositionError(
  text: string,
  attachments: readonly { kind: FeedMediaKind }[],
): "TEXT_TOO_LONG" | "EMPTY_POST" | "ATTACHMENT_LIMIT" | "VIDEO_LIMIT" | null {
  if (countFeedCharacters(text) > FEED_LIMITS.postCharacters) return "TEXT_TOO_LONG";
  if (attachments.length > FEED_LIMITS.maxAttachments) return "ATTACHMENT_LIMIT";
  if (attachments.filter((asset) => asset.kind === "video").length > FEED_LIMITS.maxVideos) {
    return "VIDEO_LIMIT";
  }
  if (!text.trim() && attachments.length === 0) return "EMPTY_POST";
  return null;
}

/** An invalid reaction must not be forwarded to the server as a supported emoji. */
export function isFeedReaction(value: unknown): value is FeedReaction {
  return typeof value === "string" && FEED_REACTIONS.some((reaction) => reaction === value);
}

export function getFeedCommentError(
  text: string,
): "VALIDATION_ERROR" | "COMMENT_TOO_LONG" | null {
  if (!text.trim()) return "VALIDATION_ERROR";
  if (countFeedCharacters(text) > FEED_LIMITS.commentCharacters) return "COMMENT_TOO_LONG";
  return null;
}

/** Receive-time clock correction to avoid incorrect relative dates when device time is wrong. */
export function getFeedClockOffsetMs(serverNow: string, clientReceivedAtMs: number): number {
  const serverMs = Date.parse(serverNow);
  return Number.isFinite(serverMs) ? serverMs - clientReceivedAtMs : 0;
}

function russianCountForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  if (n % 100 >= 11 && n % 100 <= 14) return many;
  if (n % 10 === 1) return one;
  if (n % 10 >= 2 && n % 10 <= 4) return few;
  return many;
}

/**
 * Uses elapsed milliseconds, not calendar-day boundaries.
 * nowMs + offsetMs should represent corrected server time; dates render in device timezone.
 */
export function formatFeedTime(
  isoDate: string,
  options: { nowMs?: number; offsetMs?: number; timeZone?: string } = {},
): string {
  const when = Date.parse(isoDate);
  if (!Number.isFinite(when)) return "";
  const now = (options.nowMs ?? Date.now()) + (options.offsetMs ?? 0);
  const elapsed = Math.max(0, now - when);
  if (elapsed < 60_000) return "Только что";
  if (elapsed < 3_600_000) {
    const minutes = Math.floor(elapsed / 60_000);
    return `${minutes} ${russianCountForm(minutes, "минуту", "минуты", "минут")} назад`;
  }
  if (elapsed < 86_400_000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `${hours} ${russianCountForm(hours, "час", "часа", "часов")} назад`;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  })
    .format(new Date(when))
    .replace(/\s*г\.$/u, "");
}

export const FEED_ERROR_MESSAGES = {
  FEED_DISABLED: "Лента временно недоступна.",
  UNAUTHENTICATED: "Войдите в аккаунт, чтобы открыть ленту.",
  FORBIDDEN: "У вас нет доступа к этому действию.",
  NOT_FOUND: "Публикация или комментарий недоступны.",
  TEXT_TOO_LONG: "Текст публикации превышает 5 000 символов.",
  COMMENT_TOO_LONG: "Комментарий превышает 2 000 символов.",
  EMPTY_POST: "Добавьте текст, фото или видео.",
  ATTACHMENT_LIMIT: "К публикации можно добавить не больше 10 вложений.",
  VIDEO_LIMIT: "К публикации можно добавить не больше трёх видео.",
  VIDEO_TOO_LONG: "Видео должно быть не длиннее 60 секунд.",
  UPLOAD_TOO_LARGE: "Файл превышает допустимый размер.",
  EDIT_WINDOW_CLOSED: "Изменить публикацию можно только в течение часа после публикации.",
  VERSION_CONFLICT: "Публикация уже изменилась на другом устройстве. Обновите редактор.",
  MEDIA_PROCESSING_FAILED: "Не удалось обработать файл. Попробуйте ещё раз.",
  UPLOAD_EXPIRED: "Время загрузки истекло. Выберите файл ещё раз.",
  VALIDATION_ERROR: "Проверьте введённые данные.",
} as const;
