import type {
  QuestionListDto,
  QuestionListItemDto,
  QuestionDetailDto,
  QuestionAnswerDto,
  QuestionSort,
  QuestionStatus,
  QuestionCategory,
} from "@gafus/types";
import {
  QUESTION_CATEGORIES,
  QUESTION_REPORT_REASONS,
  QUESTION_LIMITS as LIMITS,
} from "@gafus/types";
import { apiRequest } from "../../shared/api/client";
import { publicImageUrl } from "../profile/publicProfileApi";

const QUESTION_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const SORTS: QuestionSort[] = ["new", "active", "unanswered"];
const STATUSES = ["waiting", "answered", "resolved"] as const;

// Never cache raw author identities, moderation details or private media keys.
// Only validated public avatar URLs may cross into browser presentation.
export type QuestionCard = Pick<
  QuestionListItemDto,
  "id" | "title" | "category" | "status" | "answerCount" | "createdAt" |
  "tags" | "closed" | "viewCount"
> & { preview: string; authorName: string; authorAvatarUrl: string | null };

export type QuestionsPage = Pick<QuestionListDto, "nextPage" | "canPublish" | "blockReason"> & {
  items: QuestionCard[];
};

export type QuestionAnswerCard = Pick<
  QuestionAnswerDto,
  | "id"
  | "body"
  | "best"
  | "deleted"
  | "hidden"
  | "liked"
  | "hearts"
  | "parentId"
  | "replyToName"
  | "replyCount"
  | "canEdit"
  | "canDelete"
> & { authorName: string; authorAvatarUrl?: string | null; canHeart: boolean; photoIds: string[] };

export type QuestionOverview = QuestionCard &
  Pick<
    QuestionDetailDto,
    "body" | "closed" | "canReply" | "canManage" | "canEdit" | "blockReason" | "nextAnswerPage"
  > & { answers: QuestionAnswerCard[]; tags: string[]; photoIds: string[] };

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function isSafeId(id: unknown): id is string {
  return typeof id === "string" && QUESTION_ID.test(id) && id !== "." && id !== "..";
}
function isPage(n: unknown): n is number | null {
  return n === null || (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10000);
}
function validPhotoIds(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) &&
    ids.length <= LIMITS.photos &&
    ids.every(isSafeId) &&
    new Set(ids).size === ids.length
  );
}
function projectCard(value: unknown): QuestionCard {
  const q = record(value);
  const author = record(q?.author);
  if (
    !q ||
    !author ||
    !isSafeId(q.id) ||
    typeof q.title !== "string" ||
    typeof q.body !== "string" ||
    typeof q.category !== "string" ||
    !QUESTION_CATEGORIES.includes(q.category as QuestionCategory) ||
    !STATUSES.includes(q.status as (typeof STATUSES)[number]) ||
    typeof q.answerCount !== "number" ||
    !Number.isInteger(q.answerCount) ||
    q.answerCount < 0 ||
    typeof q.createdAt !== "string" ||
    typeof author.name !== "string" ||
    (q.tags !== undefined && (!Array.isArray(q.tags) ||
      q.tags.length > LIMITS.tags || !q.tags.every(tag => typeof tag === "string"))) ||
    (q.closed !== undefined && typeof q.closed !== "boolean") ||
    (q.viewCount !== undefined && (!Number.isInteger(q.viewCount) ||
      (q.viewCount as number) < 0)) ||
    (author.avatarUrl !== undefined && author.avatarUrl !== null &&
      typeof author.avatarUrl !== "string")
  ) {
    throw new Error("Сервер вернул некорректный вопрос");
  }
  return {
    id: q.id,
    title: q.title,
    preview: q.body.slice(0, 260),
    category: q.category as QuestionCategory,
    status: q.status as QuestionCard["status"],
    answerCount: q.answerCount,
    createdAt: q.createdAt,
    authorName: author.name,
    authorAvatarUrl: publicImageUrl(typeof author.avatarUrl === "string" ? author.avatarUrl : null),
    tags: Array.isArray(q.tags) ? [...(q.tags as string[])] : [],
    closed: q.closed === true,
    viewCount: typeof q.viewCount === "number" ? q.viewCount : 0,
  };
}

/** Uses Hono -> questions-server -> Core; never performs rights checks locally. */
export async function listQuestionsPage({
  page = 1,
  sort = "new",
  mine = false,
  search = "",
  category = "",
  status = "",
}: {
  page?: number;
  sort?: QuestionSort;
  mine?: boolean;
  search?: string;
  category?: QuestionCategory | "";
  status?: QuestionStatus | "";
} = {}): Promise<QuestionsPage> {
  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !SORTS.includes(sort) ||
    typeof mine !== "boolean" ||
    typeof search !== "string" ||
    search.trim().length > LIMITS.title ||
    typeof category !== "string" ||
    (category !== "" && !QUESTION_CATEGORIES.includes(category as QuestionCategory)) ||
    !["", ...STATUSES].includes(status as "" | QuestionStatus)
  )
    throw new Error("Некорректные параметры вопросов");
  // All filtering happens server-side BEFORE pagination, as in legacy Web.
  // Keep the established query keys and append only explicitly set filters.
  const params = new URLSearchParams({
    page: String(page), sort, mine: String(mine),
  });
  if (search.trim()) params.set("search", search.trim());
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  // Shared URL guard forbids literal `+`; keep exactly equivalent RFC3986 %20.
  const raw = await apiRequest<unknown>(`/api/v1/questions?${params.toString().replace(/\+/g, "%20")}`);
  const dto = record(raw);
  if (
    !dto ||
    !Array.isArray(dto.items) ||
    !isPage(dto.nextPage) ||
    (dto.nextPage !== null && dto.nextPage <= page) ||
    typeof dto.canPublish !== "boolean" ||
    !(dto.blockReason === null || typeof dto.blockReason === "string")
  ) {
    throw new Error("Сервер вернул некорректный список вопросов");
  }
  const cards = dto.items.map(projectCard);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error("Сервер вернул некорректный список вопросов");
  }
  return {
    items: cards,
    nextPage: dto.nextPage,
    canPublish: dto.canPublish,
    blockReason: dto.blockReason,
  } satisfies QuestionsPage;
}

/** Existing Next public-profile questions: authenticated exact-author GET,
 * Core filters deleted/hidden before pagination; never cache actor IDs,
 * `canPublish`, photos or any raw author response for visitor activity. */
export async function listPublicAuthorQuestions(
  username: string, page = 1,
): Promise<{items: QuestionCard[];nextPage:number|null}> {
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(username)||
     !Number.isInteger(page)||page<1||page>10000)
    throw new Error("Некорректный автор вопросов");
  const raw=await apiRequest<unknown>(
    `/api/v1/questions?author=${encodeURIComponent(username)}&sort=new&page=${page}`,
    {method:"GET",browserAuth:true,expectedStatus:200},
  );
  const dto=record(raw);
  if(!dto||!Array.isArray(dto.items)||!isPage(dto.nextPage)||
     (dto.nextPage!==null&&dto.nextPage<=page)||
     dto.items.some(value=>record(value)?.author===null||
       record(record(value)?.author)?.username!==username))
    throw new Error("Сервер вернул вопросы другого автора");
  const items=dto.items.map(projectCard);
  if(new Set(items.map(item=>item.id)).size!==items.length)
    throw new Error("Сервер вернул повторяющиеся вопросы");
  return {items,nextPage:dto.nextPage};
}

function projectAnswer(
  value: unknown,
  viewerId: string | null,
  blocked: boolean,
): QuestionAnswerCard {
  const a = record(value);
  const author = record(a?.author);
  if (
    !a ||
    !author ||
    !isSafeId(a.id) ||
    typeof a.body !== "string" ||
    typeof author.name !== "string" ||
    typeof a.best !== "boolean" ||
    typeof a.deleted !== "boolean" ||
    typeof a.hidden !== "boolean" ||
    typeof a.liked !== "boolean" ||
    typeof a.hearts !== "number" ||
    !Number.isInteger(a.hearts) ||
    a.hearts < 0 ||
    !(a.parentId === null || isSafeId(a.parentId)) ||
    !(a.replyToName === null || typeof a.replyToName === "string") ||
    typeof a.replyCount !== "number" ||
    !Number.isInteger(a.replyCount) ||
    a.replyCount < 0 ||
    typeof a.canEdit !== "boolean" ||
    typeof a.canDelete !== "boolean" ||
    !Array.isArray(a.photos) ||
    !a.photos.every((photo) => isSafeId(record(photo)?.id)) ||
    new Set(a.photos.map((photo) => record(photo)?.id)).size !== a.photos.length
  ) {
    throw new Error("Сервер вернул некорректный ответ");
  }
  return {
    id: a.id,
    body: a.body,
    authorName: author.name,
    authorAvatarUrl: publicImageUrl(typeof author.avatarUrl === "string" ? author.avatarUrl : null),
    best: a.best,
    deleted: a.deleted,
    hidden: a.hidden,
    liked: a.liked,
    hearts: a.hearts,
    parentId: a.parentId,
    replyToName: a.replyToName,
    replyCount: a.replyCount,
    canEdit: a.canEdit,
    canDelete: a.canDelete,
    photoIds: a.photos.map((photo) => record(photo)!.id as string),
    // Presentation only; Core enforces ownership and block state.
    canHeart:
      !a.deleted &&
      !a.hidden &&
      !blocked &&
      !!viewerId &&
      typeof author.id === "string" &&
      author.id !== viewerId,
  };
}

export type QuestionRepliesPage = {
  items: QuestionAnswerCard[];
  nextPage: number | null;
};

/** Read answers threaded below one root. The server performs visibility filtering. */
export async function listQuestionReplies(
  rootAnswerId: string,
  page: number,
  viewerId: string,
  blocked: boolean,
): Promise<QuestionRepliesPage> {
  if (!isSafeId(rootAnswerId) || !Number.isInteger(page) || page < 1 || page > 10000) {
    throw new Error("Некорректные параметры ответов");
  }
  const raw = await apiRequest<unknown>(
    `/api/v1/questions/answers/${rootAnswerId}/replies?page=${page}`,
  );
  const dto = record(raw);
  if (
    !dto ||
    !Array.isArray(dto.items) ||
    !isPage(dto.nextPage) ||
    (dto.nextPage !== null && dto.nextPage <= page)
  ) {
    throw new Error("Сервер вернул некорректные вложенные ответы");
  }
  return {
    items: dto.items.map((a) => projectAnswer(a, viewerId, blocked)),
    nextPage: dto.nextPage,
  };
}

export async function getQuestionOverview(
  id: string,
  page = 1,
  viewerId: string | null = null,
  sort: "useful" | "new" = "useful",
): Promise<QuestionOverview> {
  if (!isSafeId(id)) throw new Error("Некорректный идентификатор вопроса");
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    throw new Error("Некорректная страница ответов");
  }
  if (sort !== "useful" && sort !== "new")
    throw new Error("Некорректная сортировка ответов");
  // Core answerListSchema defaults to `useful` (same as Next). Preserve the
  // established URL for default reads; new order is explicitly requested.
  const raw = await apiRequest<unknown>(
    `/api/v1/questions/${id}?page=${page}${sort === "new" ? "&sort=new" : ""}`,
  );
  const dto = record(raw);
  if (
    !dto ||
    !Array.isArray(dto.answers) ||
    !isPage(dto.nextAnswerPage) ||
    (dto.nextAnswerPage !== null && dto.nextAnswerPage <= page) ||
    typeof dto.closed !== "boolean" ||
    typeof dto.body !== "string" ||
    typeof dto.canReply !== "boolean" ||
    typeof dto.canManage !== "boolean" ||
    typeof dto.canEdit !== "boolean" ||
    !Array.isArray(dto.tags) ||
    dto.tags.length > LIMITS.tags ||
    !dto.tags.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 32) ||
    !Array.isArray(dto.photos) ||
    dto.photos.length > LIMITS.photos ||
    !dto.photos.every((photo) => isSafeId(record(photo)?.id)) ||
    new Set(dto.photos.map((photo) => record(photo)?.id)).size !== dto.photos.length ||
    !(dto.blockReason === null || typeof dto.blockReason === "string")
  ) {
    throw new Error("Сервер вернул некорректный вопрос");
  }
  const answers = dto.answers.map((value) =>
    projectAnswer(value, viewerId, dto.blockReason !== null),
  );
  return {
    ...projectCard(dto),
    body: dto.body,
    closed: dto.closed,
    canReply: dto.canReply,
    canManage: dto.canManage,
    canEdit: dto.canEdit,
    blockReason: dto.blockReason,
    tags: [...dto.tags],
    photoIds: dto.photos.map((photo) => record(photo)!.id as string),
    answers,
    nextAnswerPage: dto.nextAnswerPage,
  };
}

/** A single attempt UUID remains stable across retry of unchanged content.
 * Server Core owns quotas, permissions, and idempotency enforcement.
 */
export async function createQuestion(input: {
  title: string;
  body: string;
  category: QuestionCategory;
  clientRequestId: string;
  photoIds?: string[];
  tags?: string[];
}): Promise<string> {
  if (
    !Array.isArray(input.tags ?? []) ||
    (input.tags ?? []).length > LIMITS.tags ||
    !(input.tags ?? []).every(tag => typeof tag === "string" && tag.length > 0 && tag.length <= 32) ||
    !validPhotoIds(input.photoIds ?? []) ||
    !input.title.trim() ||
    input.title.trim().length > LIMITS.title ||
    !input.body.trim() ||
    input.body.trim().length > LIMITS.body ||
    !QUESTION_CATEGORIES.includes(input.category) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.clientRequestId,
    )
  ) {
    throw new Error("Проверьте данные вопроса");
  }
  const result = await apiRequest<unknown>("/api/v1/questions", {
    method: "POST",
    json: {
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category,
      tags: input.tags ?? [],
      photoIds: input.photoIds ?? [],
      clientRequestId: input.clientRequestId,
    },
  });
  const payload = record(result);
  if (!payload || !isSafeId(payload.id)) {
    throw new Error("Сервер вернул некорректный идентификатор вопроса");
  }
  return payload.id;
}

/** New top-level answer through the shared questions-server/Core operation.
 * Core enforces question closed, user blocking, rate limits and deduplication.
 * clientRequestId MUST remain unchanged on retry of the same payload.
 */
export async function createQuestionAnswer(input: {
  questionId: string;
  body: string;
  clientRequestId: string;
  replyToId?: string | null;
  photoIds?: string[];
}): Promise<string> {
  if (
    !validPhotoIds(input.photoIds ?? []) ||
    !isSafeId(input.questionId) ||
    !(input.replyToId == null || isSafeId(input.replyToId)) ||
    !input.body.trim() ||
    input.body.trim().length > LIMITS.body ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.clientRequestId,
    )
  ) {
    throw new Error("Проверьте данные ответа");
  }
  const result = await apiRequest<unknown>("/api/v1/questions/" + input.questionId + "/answers", {
    method: "POST",
    json: {
      body: input.body.trim(),
      photoIds: input.photoIds ?? [],
      ...(input.replyToId ? { replyToId: input.replyToId } : {}),
      clientRequestId: input.clientRequestId,
    },
  });
  const data = record(result);
  if (!data || !isSafeId(data.id)) {
    throw new Error("Сервер вернул некорректный идентификатор ответа");
  }
  return data.id;
}

/** Idempotent Core-owned heart action, never an optimistic toggle. */
export async function setQuestionAnswerHeart(
  answerId: string,
  liked: boolean,
): Promise<{
  liked: boolean;
  hearts: number;
}> {
  if (!isSafeId(answerId) || typeof liked !== "boolean") {
    throw new Error("Некорректный ответ или действие");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/answers/" + answerId + "/heart", {
    method: "POST",
    json: { liked },
  });
  const data = record(raw);
  if (
    !data ||
    typeof data.liked !== "boolean" ||
    typeof data.hearts !== "number" ||
    !Number.isInteger(data.hearts) ||
    data.hearts < 0
  ) {
    throw new Error("Сервер вернул некорректную отметку");
  }
  // An opposite HTTP 200 ACK does not confirm the explicit heart action;
  // never trigger success/invalidation or an automatic replay of that POST.
  if (data.liked !== liked) {
    throw new Error("Сервер не подтвердил состояние сердечка");
  }
  return { liked: data.liked, hearts: data.hearts };
}

/** Core owns permission, audit, rewards, conflict handling and state.
 * Do not treat a write as successful until Hono acknowledges the entity.
 */
export async function setQuestionClosed(questionId: string, closed: boolean): Promise<string> {
  if (!isSafeId(questionId) || typeof closed !== "boolean") {
    throw new Error("Некорректный вопрос или действие");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/" + questionId + "/close", {
    method: "POST",
    json: { closed },
  });
  const result = record(raw);
  if (!result || result.id !== questionId) {
    throw new Error("Сервер не подтвердил изменение вопроса");
  }
  return questionId;
}

/** The selected best answer is resolved, validated and awarded by Core. */
export async function setQuestionBestAnswer(
  questionId: string,
  answerId: string | null,
): Promise<string> {
  if (!isSafeId(questionId) || (answerId !== null && !isSafeId(answerId))) {
    throw new Error("Некорректный вопрос или ответ");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/" + questionId + "/best", {
    method: "POST",
    json: { answerId },
  });
  const result = record(raw);
  if (!result || result.id !== questionId) {
    throw new Error("Сервер не подтвердил лучший ответ");
  }
  return questionId;
}

/** Text edit MUST retain already attached photos. Passing [] unbinds media in Core. */
export async function editQuestionAnswer(input: {
  answerId: string;
  body: string;
  photoIds: string[];
}): Promise<string> {
  if (
    !isSafeId(input.answerId) ||
    !input.body.trim() ||
    input.body.trim().length > LIMITS.body ||
    !Array.isArray(input.photoIds) ||
    input.photoIds.length > LIMITS.photos ||
    !input.photoIds.every(isSafeId) ||
    new Set(input.photoIds).size !== input.photoIds.length
  ) {
    throw new Error("Проверьте данные ответа");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/answers/" + input.answerId, {
    method: "PATCH",
    json: {
      body: input.body.trim(),
      photoIds: input.photoIds,
    },
  });
  const response = record(raw);
  if (!response || response.id !== input.answerId) {
    throw new Error("Сервер не подтвердил редактирование ответа");
  }
  return input.answerId;
}

/** Soft-delete owned answers only. Core enforces author or admin permissions. */
export async function deleteQuestionAnswer(answerId: string): Promise<string> {
  if (!isSafeId(answerId)) throw new Error("Некорректный идентификатор ответа");
  const raw = await apiRequest<unknown>("/api/v1/questions/answers/" + answerId, {
    method: "DELETE",
  });
  const response = record(raw);
  if (!response || response.id !== answerId) {
    throw new Error("Сервер не подтвердил удаление ответа");
  }
  return answerId;
}

/** Core edit requires tags and media IDs; preserve them to avoid unbinding. */
export async function editQuestion(input: {
  questionId: string;
  title: string;
  body: string;
  category: QuestionCategory;
  tags: string[];
  photoIds: string[];
}): Promise<string> {
  if (
    !isSafeId(input.questionId) ||
    !input.title.trim() ||
    input.title.trim().length > LIMITS.title ||
    !input.body.trim() ||
    input.body.trim().length > LIMITS.body ||
    !QUESTION_CATEGORIES.includes(input.category) ||
    !Array.isArray(input.tags) ||
    input.tags.length > LIMITS.tags ||
    !input.tags.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 32) ||
    !Array.isArray(input.photoIds) ||
    input.photoIds.length > LIMITS.photos ||
    !input.photoIds.every(isSafeId) ||
    new Set(input.photoIds).size !== input.photoIds.length
  ) {
    throw new Error("Проверьте данные вопроса");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/" + input.questionId, {
    method: "PATCH",
    json: {
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category,
      tags: input.tags,
      photoIds: input.photoIds,
    },
  });
  const response = record(raw);
  if (!response || response.id !== input.questionId) {
    throw new Error("Сервер не подтвердил редактирование вопроса");
  }
  return input.questionId;
}

/** Core soft-deletes questions and detaches the chosen best answer. */
export async function deleteQuestion(questionId: string): Promise<string> {
  if (!isSafeId(questionId)) throw new Error("Некорректный идентификатор вопроса");
  const raw = await apiRequest<unknown>("/api/v1/questions/" + questionId, {
    method: "DELETE",
  });
  const response = record(raw);
  if (!response || response.id !== questionId) {
    throw new Error("Сервер не подтвердил удаление вопроса");
  }
  return questionId;
}

/** Reporting and moderation stay in Core. Upsert per reporter+target is server-owned. */
export async function reportQuestion(input: {
  questionId: string;
  answerId?: string;
  reason: (typeof QUESTION_REPORT_REASONS)[number];
  details: string;
}): Promise<true> {
  if (
    !isSafeId(input.questionId) ||
    !(input.answerId === undefined || isSafeId(input.answerId)) ||
    !QUESTION_REPORT_REASONS.includes(input.reason) ||
    typeof input.details !== "string" ||
    input.details.trim().length > 1000
  ) {
    throw new Error("Проверьте данные жалобы");
  }
  const raw = await apiRequest<unknown>("/api/v1/questions/" + input.questionId + "/reports", {
    method: "POST",
    json: {
      ...(input.answerId ? { answerId: input.answerId } : {}),
      reason: input.reason,
      details: input.details.trim(),
    },
  });
  const data = record(raw);
  if (!data || data.reported !== true) {
    throw new Error("Сервер не подтвердил отправку жалобы");
  }
  return true;
}
