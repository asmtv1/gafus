import {
  countFeedCharacters, FEED_LIMITS, getFeedUploadedFilesPercent,
} from "@gafus/types";
import { feedClient as feed } from "./feedClient";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = ["draft", "pending", "published", "failed"] as const;
const REVISION_STATES = ["draft", "pending", "ready", "failed", "superseded"] as const;

type MomentState = (typeof STATES)[number];
type RevisionState = (typeof REVISION_STATES)[number];
export type MomentEditor = {
  id: string;
  status: MomentState;
  version: number;
  text: string;
  canEdit: boolean;
  /** Number of existing attachments. Vite text editor may never discard them. */
  attachmentCount: number;
  pendingRevision: null | {
    text: string; status: RevisionState; attachmentIds: string[];
  };
};
/** Pending-list-only projection; editor/create DTOs stay unchanged. */
export type MomentDraftPage = {
  items: (MomentEditor & { uploadPercent: number | null })[];
  nextCursor: string | null;
};

const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;
const validId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const validUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const validState = (v: unknown): v is MomentState =>
  typeof v === "string" && STATES.includes(v as MomentState);

function projectEditor(input: unknown): MomentEditor {
  const data = rec(input);
  if (!data || !validId(data.id) || !validState(data.status) ||
      !Number.isSafeInteger(data.version) || (data.version as number) < 0 ||
      typeof data.text !== "string" || typeof data.canEdit !== "boolean" ||
      !Array.isArray(data.attachments)) {
    throw new Error("Некорректный черновик публикации");
  }
  const attachments = data.attachments;
  if (!attachments.every(item => validId(rec(item)?.id))) {
    throw new Error("Некорректные вложения черновика");
  }
  const pending = data.pendingRevision;
  let pendingRevision: MomentEditor["pendingRevision"] = null;
  if (pending !== null && pending !== undefined) {
    const obj = rec(pending);
    if (!obj || typeof obj.text !== "string" ||
        !REVISION_STATES.includes(obj.status as RevisionState) ||
        !Array.isArray(obj.attachmentIds) ||
        !obj.attachmentIds.every(validId)) {
      throw new Error("Некорректная редакция черновика");
    }
    pendingRevision = {
      text: obj.text, status: obj.status as RevisionState,
      attachmentIds: obj.attachmentIds as string[],
    };
  }
  return {
    id: data.id, status: data.status, version: data.version as number,
    text: data.text, canEdit: data.canEdit, attachmentCount: attachments.length,
    pendingRevision,
  };
}

export function validateMomentText(text: string): string {
  if (typeof text !== "string" || !text.trim() ||
      countFeedCharacters(text.trim()) > FEED_LIMITS.postCharacters) {
    throw new Error("Введите текст публикации (до 5000 символов)");
  }
  return text.trim();
}

/** A draft may gain photos without losing previously linked media IDs. */
export function canAppendMomentMedia(editor: MomentEditor): boolean {
  const ids = editor.pendingRevision?.attachmentIds ?? [];
  return editor.canEdit && editor.status === "draft" &&
    // On reload, DTO.attachments may already reflect the pending revision.
    // Ensure no persisted attachment can be omitted by a new revision.
    editor.attachmentCount <= ids.length &&
    (editor.pendingRevision?.status === "draft" ||
      (editor.version === 0 && editor.pendingRevision === null)) &&
    ids.length < FEED_LIMITS.maxAttachments &&
    ids.every(validId) && new Set(ids).size === ids.length;
}

export function canEditTextOnlyMoment(editor: MomentEditor): boolean {
  return editor.canEdit &&
    (editor.status === "draft" || editor.status === "failed") &&
    editor.attachmentCount === 0 &&
    (editor.pendingRevision?.attachmentIds.length ?? 0) === 0 &&
    editor.pendingRevision?.status !== "pending";
}

/** Editing text after attaching media must preserve Core-owned attachment IDs. */
export function canEditMomentDraftText(editor: MomentEditor): boolean {
  const linked = editor.pendingRevision?.attachmentIds ?? [];
  return editor.canEdit && editor.status === "draft" &&
    // A reloaded draft may legitimately project already attached images.
    // Reject only when the pending revision omits an existing attachment.
    editor.attachmentCount <= linked.length &&
    (editor.pendingRevision?.status === "draft" ||
      (editor.version === 0 && editor.pendingRevision === null)) &&
    linked.length <= FEED_LIMITS.maxAttachments && linked.every(validId);
}

/** Versioned text revision with exactly the already-attached media; no drops. */
export async function saveMomentTextWithMedia(input: {
  editor: MomentEditor; text: string; clientRequestId: string;
}): Promise<MomentEditor> {
  const { editor, clientRequestId } = input;
  if (!canEditMomentDraftText(editor) || !validUuid(clientRequestId))
    throw new Error("Текст этого черновика недоступен для изменения");
  const text = validateMomentText(input.text);
  const ids = editor.pendingRevision?.attachmentIds ?? [];
  if (new Set(ids).size !== ids.length || !ids.every(validId))
    throw new Error("Некорректные вложения");
  const next = projectEditor(await feed.saveRevision(editor.id, {
    text, expectedVersion: editor.version, clientRequestId,
    attachmentIds: ids,
  }));
  if (next.id !== editor.id || next.version !== editor.version + 1 ||
      next.status !== "draft" || next.pendingRevision?.status !== "draft" ||
      next.pendingRevision.text !== text ||
      next.pendingRevision.attachmentIds.length !== ids.length ||
      next.pendingRevision.attachmentIds.some((id, index) => ids[index] !== id))
    throw new Error("Сервер не подтвердил сохранение текста и вложений");
  return next;
}

/** Stable create UUID lets a retry recover the same server draft. */
export async function createMomentDraft(clientRequestId: string): Promise<MomentEditor> {
  if (!validUuid(clientRequestId)) throw new Error("Некорректный ключ черновика");
  const editor = projectEditor(await feed.createPost({ clientRequestId }));
  if (editor.status !== "draft") throw new Error("Черновик недоступен");
  return editor;
}

export async function getMomentEditor(postId: string): Promise<MomentEditor> {
  if (!validId(postId)) throw new Error("Некорректная публикация");
  const editor = projectEditor(await feed.getEditor(postId));
  if (editor.id !== postId) throw new Error("Несовпадение редактора публикации");
  return editor;
}

export async function listMomentDrafts(cursor: string | null = null): Promise<MomentDraftPage> {
  if (cursor !== null && (typeof cursor !== "string" || !cursor.length ||
      cursor.length > 512)) throw new Error("Некорректная страница черновиков");
  const raw = rec(await feed.listPendingPosts({
    pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
  if (!raw || !Array.isArray(raw.items) ||
      !(raw.nextCursor === null || (typeof raw.nextCursor === "string" &&
        raw.nextCursor.length <= 512))) {
    throw new Error("Некорректный список черновиков");
  }
  return {
    items: raw.items.map(item => {
      const projected = projectEditor({ ...rec(item), pendingRevision: null });
      const attachments = rec(item)?.attachments;
      return {
        ...projected,
        uploadPercent: Array.isArray(attachments)
          ? getFeedUploadedFilesPercent(
            attachments.map(media => ({ status: rec(media)?.status })),
          )
          : null,
      };
    }),
    nextCursor: raw.nextCursor,
  };
}

export async function saveMomentText(input: {
  postId: string; text: string; expectedVersion: number; clientRequestId: string;
}): Promise<MomentEditor> {
  if (!validId(input.postId) || !validUuid(input.clientRequestId) ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error("Некорректная редакция публикации");
  }
  const text = validateMomentText(input.text);
  const editor = projectEditor(await feed.saveRevision(input.postId, {
    text, expectedVersion: input.expectedVersion,
    attachmentIds: [], clientRequestId: input.clientRequestId,
  }));
  if (editor.id !== input.postId || editor.version !== input.expectedVersion + 1 ||
      editor.attachmentCount > 0 ||
      (editor.pendingRevision?.attachmentIds.length ?? 0) > 0 ||
      (editor.pendingRevision?.text ?? editor.text) !== text) {
    throw new Error("Сервер не подтвердил сохранение редакции");
  }
  return editor;
}

export async function publishMomentDraft(
  postId: string, clientRequestId: string,
): Promise<MomentEditor> {
  if (!validId(postId) || !validUuid(clientRequestId)) {
    throw new Error("Некорректная публикация");
  }
  const editor = projectEditor(await feed.publishPost(postId, { clientRequestId }));
  if (editor.id !== postId ||
      (editor.status !== "published" && editor.status !== "pending")) {
    throw new Error("Сервер не подтвердил публикацию");
  }
  return editor;
}

export async function deleteMomentDraft(postId: string): Promise<string> {
  if (!validId(postId)) throw new Error("Некорректная публикация");
  const raw = rec(await feed.deletePost(postId));
  if (!raw || raw.id !== postId) throw new Error("Сервер не подтвердил удаление");
  return postId;
}

export async function appendMomentMediaRevision(input: {
  editor: MomentEditor;
  mediaId: string;
  clientRequestId: string;
}): Promise<MomentEditor> {
  const { editor, mediaId, clientRequestId } = input;
  if (!canAppendMomentMedia(editor) || !validId(mediaId) ||
      !validUuid(clientRequestId)) {
    throw new Error("Добавление медиа к этому черновику недоступно");
  }
  const existing = editor.pendingRevision?.attachmentIds ?? [];
  if (existing.includes(mediaId)) {
    throw new Error("Вложение уже добавлено");
  }
  const attachmentIds = [...existing, mediaId];
  const text = editor.pendingRevision?.text ?? "";
  const result = projectEditor(await feed.saveRevision(editor.id, {
    text, expectedVersion: editor.version, attachmentIds, clientRequestId,
  }));
  if (result.id !== editor.id || result.version !== editor.version + 1 ||
      result.pendingRevision?.text !== text ||
      result.pendingRevision.attachmentIds.length !== attachmentIds.length ||
      result.pendingRevision.attachmentIds.some((id, index) => id !== attachmentIds[index])) {
    throw new Error("Сервер не подтвердил присоединение вложения");
  }
  return result;
}

/** Only the author-owned unsubmitted draft can reorder exact media IDs. */
export function canReorderMomentMedia(editor: MomentEditor): boolean {
  const ids = editor.pendingRevision?.attachmentIds ?? [];
  return editor.canEdit && editor.status === "draft" &&
    editor.attachmentCount <= ids.length &&
    editor.pendingRevision?.status === "draft" &&
    ids.length >= 2 && ids.length <= FEED_LIMITS.maxAttachments &&
    ids.every(validId) && new Set(ids).size === ids.length;
}

/** Versioned reorder updates references, never storage objects. */
export async function reorderMomentMedia(input: {
  editor: MomentEditor;
  from: number;
  to: number;
  clientRequestId: string;
}): Promise<MomentEditor> {
  const { editor, from, to, clientRequestId } = input;
  if (!canReorderMomentMedia(editor) ||
      !Number.isSafeInteger(from) || !Number.isSafeInteger(to) ||
      from < 0 || to < 0 || from === to || !validUuid(clientRequestId)) {
    throw new Error("Некорректная перестановка вложений");
  }
  const ids = editor.pendingRevision!.attachmentIds;
  if (from >= ids.length || to >= ids.length) {
    throw new Error("Некорректная перестановка вложений");
  }
  const nextIds = [...ids];
  const [moved] = nextIds.splice(from, 1);
  nextIds.splice(to, 0, moved!);
  const text = editor.pendingRevision!.text;
  const confirmed = projectEditor(await feed.saveRevision(editor.id, {
    clientRequestId, expectedVersion: editor.version,
    attachmentIds: nextIds, text,
  }));
  if (confirmed.id !== editor.id || confirmed.status !== "draft" ||
      confirmed.version !== editor.version + 1 ||
      confirmed.pendingRevision?.status !== "draft" ||
      confirmed.pendingRevision.text !== text ||
      confirmed.pendingRevision.attachmentIds.length !== nextIds.length ||
      confirmed.pendingRevision.attachmentIds.some((id, index) => id !== nextIds[index])) {
    throw new Error("Сервер не подтвердил порядок вложений");
  }
  return confirmed;
}

/** Publish-ready empty revision is permitted ONLY with a server-persisted poll.
 * A draft without poll may never bypass the Feed EMPTY_POST validation.
 * Its caller explicitly proves poll existence with owner GET before calling.
 * This method never publishes or claims the post is visible. */
export async function saveMomentPollOnlyRevision(input: {
  postId: string; expectedVersion: number; clientRequestId: string;
  pollWasVerified: boolean;
}): Promise<MomentEditor> {
  if (!validId(input.postId) || !validUuid(input.clientRequestId) ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
      !input.pollWasVerified) {
    throw new Error("Опрос не подтверждён сервером");
  }
  const editor = projectEditor(await feed.saveRevision(input.postId, {
    text: "", expectedVersion: input.expectedVersion, attachmentIds: [],
    pollOnly: true, clientRequestId: input.clientRequestId,
  }));
  if (editor.id !== input.postId || editor.version !== input.expectedVersion + 1 ||
      editor.status !== "draft" || editor.pendingRevision?.status !== "draft" ||
      editor.pendingRevision.text !== "" || editor.pendingRevision.attachmentIds.length !== 0) {
    throw new Error("Сервер не подтвердил редакцию с опросом");
  }
  return editor;
}
