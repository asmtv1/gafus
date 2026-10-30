import { FEED_LIMITS, countFeedCharacters } from "@gafus/types";
import { feedClient } from "./feedClient";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION = new Set(["draft", "pending", "failed", "ready"]);

type PendingEdit = {
  status: "draft" | "pending" | "failed" | "ready";
  text: string;
  attachmentIds: string[];
};
export type PublishedMomentEditor = {
  id: string;
  status: "published";
  version: number;
  text: string;
  canEdit: boolean;
  hasPoll?: boolean;
  attachmentKinds?: ("photo" | "video")[];
  attachmentIds: string[];
  pendingRevision: PendingEdit | null;
};
const rec = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= FEED_LIMITS.maxAttachments &&
    value.every(id => typeof id === "string" && ID.test(id)) &&
    new Set(value).size === value.length;
}
function projectEditor(raw: unknown, postId: string): PublishedMomentEditor {
  const row = rec(raw);
  if (!row || row.id !== postId || row.status !== "published" ||
      !Number.isSafeInteger(row.version) || (row.version as number) < 1 ||
      typeof row.text !== "string" || typeof row.canEdit !== "boolean" ||
      !Array.isArray(row.attachments)) {
    throw new Error("Недоступен редактор публикации");
  }
  const activeIds = row.attachments.map(item => rec(item)?.id);
  if (!validIds(activeIds)) throw new Error("Некорректные вложения редакции");
  const kinds = row.attachments.map(item => rec(item)?.kind);
  const attachmentKinds = kinds.every(kind => kind === "photo" || kind === "video")
    ? kinds as ("photo" | "video")[] : undefined;

  let pending: PendingEdit | null = null;
  if (row.pendingRevision !== null && row.pendingRevision !== undefined) {
    const revision = rec(row.pendingRevision);
    if (!revision || !REVISION.has(String(revision.status)) ||
        typeof revision.text !== "string" || !validIds(revision.attachmentIds)) {
      throw new Error("Некорректная ожидающая редакция");
    }
    pending = {
      status: revision.status as PendingEdit["status"],
      text: revision.text,
      attachmentIds: revision.attachmentIds,
    };
  }
  return {
    id: postId, status: "published", version: row.version as number,
    text: row.text, canEdit: row.canEdit,
    ...(row.hasPoll === true ? { hasPoll: true } : {}),
    ...(attachmentKinds ? { attachmentKinds } : {}),
    attachmentIds: activeIds, pendingRevision: pending,
  };
}
function validateText(text: string, attachmentIds: string[], hasPoll: boolean): string {
  if (typeof text !== "string" ||
      countFeedCharacters(text) > FEED_LIMITS.postCharacters ||
      (!text.trim() && !attachmentIds.length && !hasPoll)) {
    throw new Error("Добавьте текст, вложение или опрос (до 5000 символов)");
  }
  return text.trim();
}
function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Owned editor is fetched fresh, not reconstructed from public feed pages. */
export async function getPublishedMomentEditor(postId: string): Promise<PublishedMomentEditor> {
  if (!ID.test(postId)) throw new Error("Некорректная публикация");
  return projectEditor(await feedClient.getEditor(postId), postId);
}

/** Same existing media IDs, no upload or deletion side effects. */
export async function savePublishedMomentText(input: {
  editor: PublishedMomentEditor;
  text: string;
  clientRequestId: string;
  /** Reorder or remove existing assets without modifying immutable S3 objects. */
  attachmentIds?: string[];
  /** New IDs must come from completed, same-post signed upload calls. */
  uploadedMediaIds?: string[];
}): Promise<PublishedMomentEditor> {
  const { editor, clientRequestId } = input;
  if (!ID.test(editor.id) || !UUID.test(clientRequestId) ||
      !editor.canEdit || editor.pendingRevision !== null ||
      !validIds(editor.attachmentIds)) {
    throw new Error("Изменение этой публикации недоступно");
  }
  const attachmentIds = input.attachmentIds ?? editor.attachmentIds;
  const uploadedIds = input.uploadedMediaIds ?? [];
  const knownIds = new Set([...editor.attachmentIds, ...uploadedIds]);
  if (!validIds(uploadedIds) || uploadedIds.some(id => editor.attachmentIds.includes(id)) ||
      !validIds(attachmentIds) || attachmentIds.some(id => !knownIds.has(id))) {
    throw new Error("Недоступное вложение редакции");
  }
  const text = validateText(input.text, attachmentIds, editor.hasPoll === true);
  const saved = projectEditor(await feedClient.saveRevision(editor.id, {
    text, expectedVersion: editor.version, clientRequestId, attachmentIds,
    ...(!text && !attachmentIds.length && editor.hasPoll ? { pollOnly: true as const } : {}),
  }), editor.id);
  const pending = saved.pendingRevision;
  if (saved.version !== editor.version + 1 ||
      !pending || pending.status !== "draft" ||
      pending.text !== text ||
      !sameIds(pending.attachmentIds, attachmentIds)) {
    throw new Error("Сервер не подтвердил редакцию");
  }
  return saved;
}

/** Core may keep old published text while the new media revision is processing. */
export async function publishPublishedMomentText(
  editor: PublishedMomentEditor, clientRequestId: string,
): Promise<PublishedMomentEditor> {
  if (!ID.test(editor.id) || !UUID.test(clientRequestId) ||
      !editor.pendingRevision ||
      !["draft", "failed"].includes(editor.pendingRevision.status)) {
    throw new Error("Нечего отправить на публикацию");
  }
  const confirmed = projectEditor(await feedClient.publishPost(editor.id, {
    clientRequestId,
  }), editor.id);
  if (confirmed.version !== editor.version ||
      (confirmed.pendingRevision !== null &&
        confirmed.pendingRevision.status !== "pending" &&
        confirmed.pendingRevision.status !== "ready") ||
      (confirmed.pendingRevision &&
        !sameIds(confirmed.pendingRevision.attachmentIds,
          editor.pendingRevision.attachmentIds))) {
    throw new Error("Сервер не подтвердил публикацию редакции");
  }
  return confirmed;
}
