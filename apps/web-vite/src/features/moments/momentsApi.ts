import {
  FEED_REACTIONS, FEED_SORT_OPTIONS, getFeedAuthorRoleBadge,
  getFeedCommentError,
  type FeedPostDto, type FeedReaction, type FeedSort,
} from "@gafus/types";
import { feedClient as feed } from "./feedClient";
import { publicImageUrl } from "../profile/publicProfileApi";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const STATUS = new Set(["published"]);
const MEDIA = new Set(["photo", "video"]);
const READY = new Set(["ready", "reserved", "uploaded", "processing", "failed"]);
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;

import { momentMediaFromAttachments, type MomentMedia } from "./momentMedia";

export type MomentItem = Pick<FeedPostDto,
  "id" | "text" | "createdAt" | "publishedAt" | "commentCount" | "viewCount"
  | "myReaction" | "bookmarked" | "hasPoll" | "canEdit"
> & {
  authorName: string; username: string;
  roleBadge: ReturnType<typeof getFeedAuthorRoleBadge>;
  reactions: { emoji: FeedReaction; count: number }[];
  media: MomentMedia[];
};

export type MomentsPage = { items: MomentItem[]; nextCursor: string | null };
export type MomentsStatus = { enabled: boolean; smartEnabled: boolean };

export function projectPost(value: unknown): MomentItem {
  const post = rec(value);
  const author = rec(post?.author);
  if (!post || !author || !isId(post.id) || !STATUS.has(String(post.status)) ||
      typeof post.text !== "string" || typeof post.createdAt !== "string" ||
      !(post.publishedAt === null || typeof post.publishedAt === "string") ||
      typeof author.name !== "string" || typeof author.username !== "string" ||
      !Array.isArray(post.reactions) || !Array.isArray(post.attachments) ||
      typeof post.commentCount !== "number" || !Number.isSafeInteger(post.commentCount) ||
      post.commentCount < 0 || typeof post.viewCount !== "number" ||
      !Number.isSafeInteger(post.viewCount) || post.viewCount < 0 ||
      !(post.myReaction === null || FEED_REACTIONS.includes(post.myReaction as FeedReaction)) ||
      !(post.bookmarked === undefined || typeof post.bookmarked === "boolean") ||
      !(post.hasPoll === undefined || typeof post.hasPoll === "boolean") ||
      typeof post.canEdit !== "boolean") {
    throw new Error("Сервер вернул некорректную публикацию");
  }
  const reactions = post.reactions.map(value => {
    const row = rec(value);
    if (!row || !FEED_REACTIONS.includes(row.emoji as FeedReaction) ||
        !Number.isSafeInteger(row.count) || (row.count as number) < 0) {
      throw new Error("Сервер вернул некорректные реакции");
    }
    return { emoji: row.emoji as FeedReaction, count: row.count as number };
  });
  const media = momentMediaFromAttachments(post.attachments);
  return {
    id: post.id, text: post.text, createdAt: post.createdAt,
    publishedAt: post.publishedAt, commentCount: post.commentCount,
    viewCount: post.viewCount, myReaction: post.myReaction as FeedReaction | null,
    bookmarked: post.bookmarked as boolean | undefined,
    hasPoll: post.hasPoll as boolean | undefined,
    canEdit: post.canEdit as boolean,
    authorName: author.name, username: author.username,
    roleBadge: getFeedAuthorRoleBadge(author.role as string | null | undefined),
    reactions, media,
  };
}

export async function getMomentsStatus(): Promise<MomentsStatus> {
  const raw = rec(await feed.status());
  if (!raw || typeof raw.enabled !== "boolean" ||
      !(raw.smartEnabled === undefined || typeof raw.smartEnabled === "boolean")) {
    throw new Error("Сервер вернул некорректный статус «Моментов»");
  }
  return { enabled: raw.enabled, smartEnabled: raw.smartEnabled === true };
}

function projectPage(raw: unknown): MomentsPage {
  const data = rec(raw);
  if (!data || !Array.isArray(data.items) ||
      !(data.nextCursor === null ||
        (typeof data.nextCursor === "string" && data.nextCursor.length <= 2048))) {
    throw new Error("Сервер вернул некорректную страницу «Моментов»");
  }
  return { items: data.items.map(projectPost), nextCursor: data.nextCursor };
}

export async function listMoments(
  sort: FeedSort = "new", cursor: string | null = null,
): Promise<MomentsPage> {
  if (!FEED_SORT_OPTIONS.includes(sort) ||
      (cursor !== null && (typeof cursor !== "string" ||
        cursor.length > 512 || !cursor.length))) {
    throw new Error("Некорректные параметры ленты");
  }
  return projectPage(await feed.listPosts({
    sort, pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
}

/** Browser-safe subset of existing profile usernames, never a path fragment. */
export function isSafeMomentUsername(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export async function listProfileMoments(
  username: string, cursor: string | null = null,
): Promise<MomentsPage> {
  if (!isSafeMomentUsername(username) ||
      (cursor !== null && (typeof cursor !== "string" ||
        cursor.length < 1 || cursor.length > 512))) {
    throw new Error("Некорректный профиль «Моментов»");
  }
  const page = projectPage(await feed.listProfilePosts(username, {
    pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
  if (page.items.some(item => item.username !== username)) {
    throw new Error("Сервер вернул публикации другого автора");
  }
  return page;
}

export async function getMoment(id: string): Promise<MomentItem> {
  if (!isId(id)) throw new Error("Некорректная публикация");
  return projectPost(await feed.getPost(id));
}

/** Social mutations reuse existing Feed/Core authorization, quotas and counters. */
export async function setMomentReaction(
  id: string, emoji: FeedReaction | null,
): Promise<MomentItem> {
  if (!isId(id) || (emoji !== null && !FEED_REACTIONS.includes(emoji))) {
    throw new Error("Некорректная реакция");
  }
  const response = emoji === null
    ? await feed.removePostReaction(id)
    : await feed.setPostReaction(id, emoji);
  if (rec(response)?.id !== id) throw new Error("Сервер не подтвердил реакцию");
  return projectPost(response);
}

export async function setMomentBookmark(id: string, saved: boolean): Promise<boolean> {
  if (!isId(id) || typeof saved !== "boolean") {
    throw new Error("Некорректная закладка");
  }
  const raw = rec(await feed.setBookmark(id, saved));
  if (!raw || raw.saved !== saved) {
    throw new Error("Сервер не подтвердил закладку");
  }
  return saved;
}

export type MomentComment = {
  id: string;
  text: string;
  authorName: string;
  username: string;
  roleBadge: ReturnType<typeof getFeedAuthorRoleBadge>;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  rootId: string | null;
  replyToName: string | null;
  replyCount: number;
  replyToId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  myReaction: FeedReaction | null;
  reactions: { emoji: FeedReaction; count: number }[];
  media?: MomentMedia[];
  mediaProcessing?: number;
  mediaFailed?: boolean;
};
export type MomentCommentsPage = { items: MomentComment[]; nextCursor: string | null };

export function projectComment(value: unknown): MomentComment {
  const comment = rec(value);
  const author = rec(comment?.author);
  if (!comment || !author || !isId(comment.id) ||
      typeof comment.text !== "string" || typeof comment.createdAt !== "string" ||
      !(comment.editedAt === undefined || comment.editedAt === null ||
        typeof comment.editedAt === "string") ||
      typeof author.name !== "string" || typeof author.username !== "string" ||
      typeof comment.deleted !== "boolean" ||
      !(comment.rootId === null || isId(comment.rootId)) ||
      !(comment.replyToName === null || typeof comment.replyToName === "string") ||
      !Number.isSafeInteger(comment.replyCount) ||
      (comment.replyCount as number) < 0 ||
      !(comment.replyToId === null || isId(comment.replyToId)) ||
      typeof comment.canEdit !== "boolean" || typeof comment.canDelete !== "boolean" ||
      !(comment.myReaction === null ||
        FEED_REACTIONS.includes(comment.myReaction as FeedReaction)) ||
      !Array.isArray(comment.reactions)) {
    throw new Error("Сервер вернул некорректный комментарий");
  }
  const incomingMedia = comment.media === undefined ? [] : comment.media;
  if (!Array.isArray(incomingMedia) || incomingMedia.length > 10) {
    throw new Error("Некорректные вложения комментария");
  }
  const media = comment.deleted ? [] : momentMediaFromAttachments(incomingMedia);
  const mediaProcessing = incomingMedia.filter(value => {
    const row = rec(value);
    return row && ["reserved","uploaded","processing"].includes(String(row.status));
  }).length;
  const mediaFailed = incomingMedia.some(value => {
    const row = rec(value);
    return row && ["failed","expired","cancelled"].includes(String(row.status));
  });
  const reactions = comment.reactions.map(value => {
    const reaction = rec(value);
    if (!reaction || !FEED_REACTIONS.includes(reaction.emoji as FeedReaction) ||
        !Number.isSafeInteger(reaction.count) || (reaction.count as number) < 0) {
      throw new Error("Сервер вернул некорректные реакции комментария");
    }
    return { emoji: reaction.emoji as FeedReaction, count: reaction.count as number };
  });
  return {
    id: comment.id, text: comment.deleted ? "" : comment.text,
    authorName: author.name, username: author.username,
    roleBadge: getFeedAuthorRoleBadge(author.role as string | null | undefined),
    createdAt: comment.createdAt, editedAt: (comment.editedAt ?? null) as string | null,
    deleted: comment.deleted,
    rootId: comment.rootId, replyToName: comment.replyToName,
    replyCount: comment.replyCount as number,
    replyToId: comment.replyToId as string | null,
    canEdit: !comment.deleted && comment.canEdit as boolean,
    canDelete: !comment.deleted && comment.canDelete as boolean,
    myReaction: comment.deleted ? null : comment.myReaction as FeedReaction | null,
    reactions: comment.deleted ? [] : reactions,
    media, mediaProcessing: comment.deleted ? 0 : mediaProcessing,
    mediaFailed: !comment.deleted && mediaFailed,
  };
}

function validCursor(cursor: string | null): boolean {
  return cursor === null || (typeof cursor === "string" &&
    cursor.length > 0 && cursor.length <= 512);
}
export function projectCommentsPage(raw: unknown): MomentCommentsPage {
  const page = rec(raw);
  if (!page || !Array.isArray(page.items) || !validCursor(page.nextCursor as string | null)) {
    throw new Error("Сервер вернул некорректный список комментариев");
  }
  return { items: page.items.map(projectComment), nextCursor: page.nextCursor as string | null };
}

export async function listMomentComments(
  postId: string, cursor: string | null = null,
): Promise<MomentCommentsPage> {
  if (!isId(postId) || !validCursor(cursor)) {
    throw new Error("Некорректные параметры комментариев");
  }
  return projectCommentsPage(await feed.listComments(postId, {
    pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
}

export async function listMomentReplies(
  rootId: string, cursor: string | null = null,
): Promise<MomentCommentsPage> {
  if (!isId(rootId) || !validCursor(cursor)) {
    throw new Error("Некорректные параметры ответов");
  }
  const page = projectCommentsPage(await feed.listReplies(rootId, {
    pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
  if (page.items.some(item => item.rootId !== rootId)) {
    throw new Error("Сервер вернул ответ из другой ветки");
  }
  return page;
}

/** Idempotency UUID is stable for retrying one unchanged text/target. */
export async function createMomentComment(input: {
  postId: string; text: string; clientRequestId: string;
  mediaIds?: string[];
  replyToId?: string | null;
}): Promise<string> {
  if (!isId(input.postId) || (input.replyToId != null && !isId(input.replyToId)) ||
      (!input.text.trim() && !input.mediaIds?.length) ||
      (input.text.trim() && getFeedCommentError(input.text) !== null) ||
      (input.mediaIds?.length ?? 0) > 10 || input.mediaIds?.some(id => !isId(id)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(input.clientRequestId)) {
    throw new Error("Проверьте данные комментария");
  }
  const raw = rec(await feed.createComment(input.postId, {
    text: input.text.trim(), clientRequestId: input.clientRequestId,
    ...(input.mediaIds?.length ? { mediaIds: input.mediaIds } : {}),
    ...(input.replyToId ? { replyToId: input.replyToId } : {}),
  }));
  if (!raw || !isId(raw.id) || raw.postId !== input.postId) {
    throw new Error("Сервер не подтвердил комментарий");
  }
  return raw.id;
}

export async function listSavedMoments(cursor: string | null = null): Promise<MomentsPage> {
  if (cursor !== null && (typeof cursor !== "string" ||
      cursor.length < 1 || cursor.length > 512)) {
    throw new Error("Некорректный курсор закладок");
  }
  return projectPage(await feed.listBookmarks({
    pageSize: 20, ...(cursor === null ? {} : { cursor }),
  }));
}

/** Server owns edit window, permissions, soft-delete and reaction aggregates. */
export async function editMomentComment(commentId: string, text: string): Promise<MomentComment> {
  if (!isId(commentId) || getFeedCommentError(text) !== null) {
    throw new Error("Проверьте данные комментария");
  }
  const raw = await feed.editComment(commentId, { text: text.trim() });
  if (rec(raw)?.id !== commentId) throw new Error("Сервер не подтвердил редактирование");
  return projectComment(raw);
}

export async function deleteMomentComment(commentId: string): Promise<string> {
  if (!isId(commentId)) throw new Error("Некорректный комментарий");
  const raw = rec(await feed.deleteComment(commentId));
  if (!raw || raw.id !== commentId) throw new Error("Сервер не подтвердил удаление");
  return commentId;
}

export async function setMomentCommentReaction(
  commentId: string, emoji: FeedReaction | null,
): Promise<FeedReaction | null> {
  if (!isId(commentId) || (emoji !== null && !FEED_REACTIONS.includes(emoji))) {
    throw new Error("Некорректная реакция");
  }
  const raw = rec(emoji === null
    ? await feed.removeCommentReaction(commentId)
    : await feed.setCommentReaction(commentId, emoji));
  if (!raw || raw.reaction !== emoji) throw new Error("Сервер не подтвердил реакцию");
  return emoji;
}

export type MomentPoll = {
  id: string;
  postId: string;
  question: string;
  isQuiz: boolean;
  allowMultiple: boolean;
  isAnonymous: boolean;
  closed: boolean;
  canClose: boolean;
  totalVotes: number | null;
  myOptionIds: string[];
  options: { id: string; text: string; votes: number | null;
    isCorrect: boolean | null; hasImage?: boolean }[];
  explanation: string | null;
};

function projectPoll(raw: unknown, postId: string): MomentPoll {
  const data = rec(raw);
  if (!data || !isId(data.id) || data.postId !== postId ||
      typeof data.question !== "string" || !data.question.trim() ||
      typeof data.allowMultiple !== "boolean" || typeof data.isQuiz !== "boolean" ||
      typeof data.isAnonymous !== "boolean" || typeof data.closed !== "boolean" ||
      !(data.canClose === undefined || typeof data.canClose === "boolean") ||
      !(data.totalVotes === null || (Number.isSafeInteger(data.totalVotes) &&
        (data.totalVotes as number) >= 0)) ||
      !(data.explanation === null || typeof data.explanation === "string") ||
      !Array.isArray(data.options) || data.options.length < 2 || data.options.length > 10 ||
      !Array.isArray(data.myOptionIds) ||
      !data.myOptionIds.every(isId) ||
      new Set(data.myOptionIds).size !== data.myOptionIds.length) {
    throw new Error("Сервер вернул некорректный опрос");
  }
  const options = data.options.map(value => {
    const option = rec(value);
    if (!option || !isId(option.id) || typeof option.text !== "string" ||
        !option.text.trim() || !(option.votes === null ||
        (Number.isSafeInteger(option.votes) && (option.votes as number) >= 0)) ||
        !(option.isCorrect === undefined || typeof option.isCorrect === "boolean")) {
      throw new Error("Сервер вернул некорректный вариант опроса");
    }
    if (option.imageMediaId !== undefined && option.imageMediaId !== null &&
        !isId(option.imageMediaId)) {
      throw new Error("Сервер вернул некорректное изображение опроса");
    }
    return {
      id: option.id, text: option.text,
      votes: option.votes as number | null,
      isCorrect: option.isCorrect === undefined ? null : option.isCorrect as boolean,
      ...(option.imageMediaId ? { hasImage: true } : {}),
    };
  });
  if (new Set(options.map(option => option.id)).size !== options.length ||
      data.myOptionIds.some(id => !options.some(option => option.id === id)) ||
      (!data.allowMultiple && data.myOptionIds.length > 1) ||
      (data.totalVotes === null && options.some(option => option.votes !== null))) {
    throw new Error("Сервер вернул некорректные результаты опроса");
  }
  return {
    id: data.id, postId, question: data.question,
    isQuiz: data.isQuiz, allowMultiple: data.allowMultiple,
    isAnonymous: data.isAnonymous, closed: data.closed,
    canClose: data.canClose === true && data.closed === false,
    totalVotes: data.totalVotes as number | null,
    myOptionIds: data.myOptionIds as string[], options,
    explanation: data.explanation as string | null,
  };
}

export type MomentPollVotersPage = {
  optionId: string;
  items: { id: string; username: string; name: string; avatarUrl: string | null }[];
  nextCursor: string | null;
};

/** Deliberately never cache public identities across users or poll visibility changes. */
export async function listMomentPollVoters(
  postId: string, optionId: string, cursor: string | null = null,
): Promise<MomentPollVotersPage> {
  if (!isId(postId) || !isId(optionId) || (cursor !== null && !isId(cursor))) {
    throw new Error("Некорректный запрос участников опроса");
  }
  const data = rec(await feed.listPollVoters(postId, optionId, cursor));
  if (!data || data.optionId !== optionId || !Array.isArray(data.items) ||
      data.items.length > 10 || !(data.nextCursor === null || isId(data.nextCursor))) {
    throw new Error("Сервер вернул некорректную страницу участников");
  }
  const items = data.items.map(value => {
    const item = rec(value);
    if (!item || !isId(item.id) || typeof item.username !== "string" ||
        !isSafeMomentUsername(item.username) ||
        typeof item.name !== "string" || !item.name.trim()) {
      throw new Error("Сервер вернул некорректного участника опроса");
    }
    return {
      id: item.id,
      username: item.username as string,
      name: item.name,
      avatarUrl: item.avatarUrl === null || item.avatarUrl === undefined
        ? null : typeof item.avatarUrl === "string" ? publicImageUrl(item.avatarUrl) : null,
    };
  });
  if (new Set(items.map(item => item.id)).size !== items.length ||
      (data.nextCursor !== null && !items.length)) {
    throw new Error("Сервер вернул повторяющихся участников опроса");
  }
  return { optionId, items, nextCursor: data.nextCursor as string | null };
}

/** Manual close ACK must still be verified by an independent fresh GET. */
export async function closeMomentPoll(postId: string): Promise<MomentPoll> {
  if (!isId(postId)) throw new Error("Некорректная публикация");
  const ack = projectPoll(await feed.closePoll(postId), postId);
  if (!ack.closed || ack.canClose) throw new Error("Сервер не подтвердил завершение опроса");
  const fresh = await getMomentPoll(postId);
  if (!fresh.closed || fresh.canClose) throw new Error("Не удалось подтвердить завершение чтением");
  return fresh;
}

/** Only the server decides visibility of poll results, correct answers and voting. */
export async function getMomentPoll(postId: string): Promise<MomentPoll> {
  if (!isId(postId)) throw new Error("Некорректная публикация");
  return projectPoll(await feed.getPoll(postId), postId);
}

/** Author-only read: 200/null means no poll, but an inaccessible draft stays 404. */
export async function getMomentDraftPoll(postId: string): Promise<MomentPoll | null> {
  if (!isId(postId)) throw new Error("Некорректная публикация");
  const result = await feed.getDraftPoll(postId);
  return result === null ? null : projectPoll(result, postId);
}

export async function voteMomentPoll(postId: string, optionIds: string[]): Promise<MomentPoll> {
  if (!isId(postId) || !Array.isArray(optionIds) || optionIds.length < 1 ||
      optionIds.length > 10 || !optionIds.every(isId) ||
      new Set(optionIds).size !== optionIds.length) {
    throw new Error("Проверьте варианты голосования");
  }
  const result = projectPoll(await feed.votePoll(postId, { optionIds }), postId);
  if (optionIds.length !== result.myOptionIds.length ||
      optionIds.some(id => !result.myOptionIds.includes(id))) {
    throw new Error("Сервер не подтвердил голосование");
  }
  return result;
}


/** The existing Core vote path supports revising an actor-owned ordinary vote. */
export async function changeMomentPollVote(
  postId: string, optionIds: string[],
): Promise<MomentPoll> {
  if (!isId(postId) || !Array.isArray(optionIds) || optionIds.length < 1 ||
      optionIds.length > 10 || !optionIds.every(isId) ||
      new Set(optionIds).size !== optionIds.length) {
    throw new Error("Проверьте варианты изменения голоса");
  }
  const result = projectPoll(await feed.changePollVote(postId, { optionIds }), postId);
  if (result.myOptionIds.length !== optionIds.length ||
      optionIds.some(id => !result.myOptionIds.includes(id))) {
    throw new Error("Сервер не подтвердил изменение голоса");
  }
  return result;
}

/** DELETE requires an empty JSON body; shared Feed transport owns encoding. */
export async function cancelMomentPollVote(postId: string): Promise<MomentPoll> {
  if (!isId(postId)) throw new Error("Некорректная публикация");
  const result = projectPoll(await feed.cancelPollVote(postId), postId);
  if (result.myOptionIds.length !== 0) {
    throw new Error("Сервер не подтвердил отмену голоса");
  }
  return result;
}
