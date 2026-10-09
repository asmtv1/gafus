import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import {
  QUESTION_LIMITS,
  type QuestionAuthorDto,
  type QuestionCategory,
  type QuestionListItemDto,
  type QuestionAnswerDto,
  type QuestionDetailDto,
  type QuestionListDto,
} from "@gafus/types";
import { QuestionError } from "./errors";
import {
  answerCreateSchema,
  answerEditSchema,
  answerListSchema,
  questionCreateSchema,
  questionEditSchema,
  questionListSchema,
  questionReportSchema,
} from "./schemas";

type Tx = Prisma.TransactionClient;
const available = { deletedAt: null, hiddenAt: null } as const;
const authorSelect = {
  id: true,
  username: true,
  profile: { select: { fullName: true, avatarUrl: true } },
} as const;
const photosSelect = { id: true, url: true } as const;
function author(row: {
  id: string;
  username: string;
  profile: { fullName: string | null; avatarUrl: string | null } | null;
}): QuestionAuthorDto {
  return {
    id: row.id,
    name: row.profile?.fullName || row.username,
    username: row.username,
    avatarUrl: row.profile?.avatarUrl ?? null,
  };
}
export async function questionActor(userId: string, db: Tx = prisma, write = false) {
  if (write) await db.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, registrationPending: true, questionBlock: true },
  });
  if (!user || user.registrationPending)
    throw new QuestionError("UNAUTHORIZED", "Не авторизован", 401);
  if (write && user.questionBlock)
    throw new QuestionError(
      "QUESTIONS_BLOCKED",
      `Публикации в вопросах заблокированы: ${user.questionBlock.reason}`,
      403,
    );
  return { ...user, isAdmin: user.role === "ADMIN" };
}
export async function requireQuestionAdmin(userId: string, db: Tx = prisma) {
  const actor = await questionActor(userId, db);
  if (!actor.isAdmin) throw new QuestionError("FORBIDDEN", "Доступно только администратору", 403);
  return actor;
}
async function questionForActor(id: string, db: Tx = prisma, lock = false) {
  if (lock) await db.$queryRaw`SELECT id FROM "Question" WHERE id = ${id} FOR UPDATE`;
  const question = await db.question.findFirst({ where: { id, ...available } });
  if (!question) throw new QuestionError("NOT_FOUND", "Вопрос удалён или недоступен", 404);
  return question;
}
function requireOwner(actor: { id: string; isAdmin: boolean }, ownerId: string) {
  if (actor.id !== ownerId && !actor.isAdmin)
    throw new QuestionError("FORBIDDEN", "Недостаточно прав", 403);
}
async function bindPhotos(
  tx: Tx,
  userId: string,
  ids: string[],
  target: { questionId: string } | { answerId: string },
  edit = false,
) {
  const rows = await tx.questionPhoto.findMany({ where: { id: { in: ids }, ownerId: userId } });
  const questionId = "questionId" in target ? target.questionId : null;
  const answerId = "answerId" in target ? target.answerId : null;
  if (
    rows.length !== ids.length ||
    rows.some(
      (r) =>
        !r.url ||
        ((r.questionId !== null || r.answerId !== null) &&
          !(edit && r.questionId === questionId && r.answerId === answerId)),
    )
  )
    throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно. Прикрепите его заново", 403);
  if (edit)
    await tx.questionPhoto.updateMany({
      where: { ...target, id: { notIn: ids } },
      data: { questionId: null, answerId: null },
    });
  if (ids.length) await tx.questionPhoto.updateMany({ where: { id: { in: ids } }, data: target });
}
/** Notification and publication commit together. Worker reconciles unsent question jobs. */
async function notify(
  tx: Tx,
  userId: string,
  actorId: string,
  questionId: string,
  title: string,
  body: string,
) {
  if (userId === actorId) return;
  if (!(await tx.pushSubscription.count({ where: { userId } }))) return;
  await tx.stepNotification.create({
    data: {
      id: `question-${randomUUID()}`,
      userId,
      day: 0,
      stepIndex: 0,
      endTs: Math.floor(Date.now() / 1000),
      type: "immediate",
      stepTitle: `${title}|${body.replace(/\|/g, " ").slice(0, 160)}`,
      url: `/questions/${questionId}`,
      sent: false,
      paused: false,
      subscription: {},
    },
  });
}
const listInclude = {
  author: { select: authorSelect },
  bestAnswer: { select: { id: true, body: true, deletedAt: true, hiddenAt: true } },
  _count: { select: { answers: { where: available }, views: true } },
} as const;
type ListRow = Prisma.QuestionGetPayload<{ include: typeof listInclude }>;
function listDto(row: ListRow): QuestionListItemDto {
  const best =
    row.bestAnswer && !row.bestAnswer.deletedAt && !row.bestAnswer.hiddenAt ? row.bestAnswer : null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category as QuestionCategory,
    tags: row.tags,
    author: author(row.author),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    status: best ? "resolved" : row._count.answers > 0 ? "answered" : "waiting",
    closed: !!row.closedAt,
    answerCount: row._count.answers,
    viewCount: row._count.views,
    bestAnswer: best ? { id: best.id, body: best.body.slice(0, 240) } : null,
  };
}
function answerInclude(userId: string) {
  return {
    author: { select: authorSelect },
    photos: { select: photosSelect },
    replyTo: { select: { author: { select: authorSelect } } },
    hearts: { where: { userId }, select: { userId: true } },
    _count: { select: { hearts: true, children: { where: available } } },
  } as const;
}
type AnswerRow = Prisma.QuestionAnswerGetPayload<{ include: ReturnType<typeof answerInclude> }>;
function answerDto(
  row: AnswerRow,
  actor: { id: string; isAdmin: boolean },
  bestId: string | null,
): QuestionAnswerDto {
  const removed = !!row.deletedAt || !!row.hiddenAt;
  return {
    id: row.id,
    body: removed ? (row.hiddenAt ? "Ответ скрыт модератором" : "Ответ удалён") : row.body,
    author: author(row.author),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    parentId: row.parentId,
    replyToName: row.replyTo ? author(row.replyTo.author).name : null,
    deleted: !!row.deletedAt,
    hidden: !!row.hiddenAt,
    photos: removed ? [] : row.photos,
    hearts: removed ? 0 : row._count.hearts,
    liked: !removed && row.hearts.length > 0,
    best: !removed && row.id === bestId,
    canEdit: !removed && row.authorId === actor.id,
    canDelete: !removed && (row.authorId === actor.id || actor.isAdmin),
    replyCount: row._count.children,
  };
}
const visibleThread: Prisma.QuestionAnswerWhereInput = {
  OR: [available, { children: { some: available } }],
};
export async function listQuestions(userId: string, query: unknown): Promise<QuestionListDto> {
  const actor = await questionActor(userId);
  const filters = questionListSchema.parse(query);
  const where: Prisma.QuestionWhereInput = { ...available };
  if (filters.mine) where.authorId = userId;
  if (filters.category) where.category = filters.category;
  if (filters.search)
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { body: { contains: filters.search, mode: "insensitive" } },
      { tags: { has: filters.search.replace(/^#/, "") } },
    ];
  if (filters.status === "resolved") where.bestAnswerId = { not: null };
  if (filters.status === "waiting" || filters.sort === "unanswered")
    where.answers = { none: available };
  if (filters.status === "answered") {
    where.bestAnswerId = null;
    where.answers = { some: available };
  }
  const rows = await prisma.question.findMany({
    where,
    include: listInclude,
    orderBy:
      filters.sort === "active"
        ? [{ activityAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    skip: (filters.page - 1) * QUESTION_LIMITS.pageSize,
    take: QUESTION_LIMITS.pageSize + 1,
  });
  return {
    items: rows.slice(0, QUESTION_LIMITS.pageSize).map(listDto),
    nextPage: rows.length > QUESTION_LIMITS.pageSize ? filters.page + 1 : null,
    canPublish: !actor.questionBlock,
    blockReason: actor.questionBlock?.reason ?? null,
  };
}
export async function getQuestion(
  userId: string,
  id: string,
  query: unknown,
): Promise<QuestionDetailDto> {
  const actor = await questionActor(userId);
  const filters = answerListSchema.parse(query);
  await questionForActor(id);
  // Reading detail counts once. Unique key makes simultaneous opens idempotent.
  await prisma.questionView.createMany({
    data: [{ questionId: id, userId }],
    skipDuplicates: true,
  });
  const row = await prisma.question.findFirst({
    where: { id, ...available },
    include: { ...listInclude, photos: { select: photosSelect } },
  });
  if (!row) throw new QuestionError("NOT_FOUND", "Вопрос недоступен", 404);
  const roots = await prisma.questionAnswer.findMany({
    where: { questionId: id, parentId: null, ...visibleThread },
    include: answerInclude(userId),
    orderBy:
      filters.sort === "new"
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ hearts: { _count: "desc" } }, { createdAt: "asc" }, { id: "asc" }],
    skip: (filters.page - 1) * QUESTION_LIMITS.pageSize,
    take: QUESTION_LIMITS.pageSize + 1,
  });
  const pageRoots = roots.slice(0, QUESTION_LIMITS.pageSize);
  // Best answer is pinned even if it is a reply or belongs to a later page.
  if (row.bestAnswerId && filters.page === 1) {
    const best = await prisma.questionAnswer.findFirst({
      where: { id: row.bestAnswerId, ...available },
      include: answerInclude(userId),
    });
    if (best && !pageRoots.some((a) => a.id === best.id)) pageRoots.unshift(best);
  }
  const answers: QuestionAnswerDto[] = [];
  for (const root of pageRoots) {
    answers.push(answerDto(root, actor, row.bestAnswerId));
    if (root.parentId) continue;
    const children = await prisma.questionAnswer.findMany({
      where: { parentId: root.id, ...available },
      include: answerInclude(userId),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: QUESTION_LIMITS.pageSize,
    });
    answers.push(
      ...children
        .filter((a) => !pageRoots.some((r) => r.id === a.id))
        .map((a) => answerDto(a, actor, row.bestAnswerId)),
    );
  }
  answers.sort((a, b) => Number(b.best) - Number(a.best));
  return {
    ...listDto(row),
    photos: row.photos,
    answers,
    nextAnswerPage: roots.length > QUESTION_LIMITS.pageSize ? filters.page + 1 : null,
    canManage: actor.isAdmin || row.authorId === userId,
    canEdit: row.authorId === userId,
    canReply: !row.closedAt && !actor.questionBlock,
    isAdmin: actor.isAdmin,
    blockReason: actor.questionBlock?.reason ?? null,
  };
}
export async function getQuestionReplies(userId: string, answerId: string, page: number) {
  const actor = await questionActor(userId);
  const root = await prisma.questionAnswer.findUnique({ where: { id: answerId } });
  if (!root) throw new QuestionError("NOT_FOUND", "Ответ недоступен", 404);
  const question = await questionForActor(root.questionId);
  const rows = await prisma.questionAnswer.findMany({
    where: { parentId: root.id, ...available },
    include: answerInclude(userId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * QUESTION_LIMITS.pageSize,
    take: QUESTION_LIMITS.pageSize + 1,
  });
  return {
    items: rows
      .slice(0, QUESTION_LIMITS.pageSize)
      .map((r) => answerDto(r, actor, question.bestAnswerId)),
    nextPage: rows.length > QUESTION_LIMITS.pageSize ? page + 1 : null,
  };
}
export async function createQuestion(userId: string, input: unknown) {
  const data = questionCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await questionActor(userId, tx, true);
    const existing = await tx.question.findUnique({
      where: {
        authorId_clientRequestId: { authorId: userId, clientRequestId: data.clientRequestId },
      },
    });
    if (existing) return { id: existing.id };
    const count = await tx.question.count({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 86400000) } },
    });
    if (count >= QUESTION_LIMITS.dailyQuestions)
      throw new QuestionError("RATE_LIMIT", "Можно задать не больше 5 вопросов за 24 часа", 429);
    const { photoIds, ...fields } = data;
    const row = await tx.question.create({ data: { ...fields, authorId: userId } });
    await bindPhotos(tx, userId, photoIds, { questionId: row.id });
    return { id: row.id };
  });
}
export async function editQuestion(userId: string, id: string, input: unknown) {
  const data = questionEditSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx, true);
    const row = await questionForActor(id, tx, true);
    // Administrators moderate; authors edit the content.
    if (row.authorId !== actor.id)
      throw new QuestionError("FORBIDDEN", "Редактировать может только автор", 403);
    const { photoIds, ...fields } = data;
    await bindPhotos(tx, userId, photoIds, { questionId: id }, true);
    await tx.question.update({ where: { id }, data: { ...fields, editedAt: new Date() } });
    return { id };
  });
}
export async function deleteQuestion(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx);
    const row = await questionForActor(id, tx, true);
    requireOwner(actor, row.authorId);
    await tx.question.update({
      where: { id },
      data: { deletedAt: new Date(), bestAnswerId: null },
    });
    return { id };
  });
}
export async function createQuestionAnswer(userId: string, questionId: string, input: unknown) {
  const data = answerCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await questionActor(userId, tx, true);
    const question = await questionForActor(questionId, tx, true);
    const existing = await tx.questionAnswer.findUnique({
      where: {
        authorId_clientRequestId: { authorId: userId, clientRequestId: data.clientRequestId },
      },
    });
    if (existing) {
      if (existing.questionId !== questionId)
        throw new QuestionError(
          "REQUEST_CONFLICT",
          "Запрос уже использован для другого вопроса",
          409,
        );
      return { id: existing.id };
    }
    if (question.closedAt)
      throw new QuestionError("QUESTION_CLOSED", "Автор закрыл обсуждение", 409);
    const count = await tx.questionAnswer.count({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 3600000) } },
    });
    if (count >= QUESTION_LIMITS.hourlyAnswers)
      throw new QuestionError("RATE_LIMIT", "Можно написать не больше 30 ответов за час", 429);
    const target = data.replyToId
      ? await tx.questionAnswer.findFirst({
          where: { id: data.replyToId, questionId, ...available },
        })
      : null;
    if (data.replyToId && !target)
      throw new QuestionError("REPLY_UNAVAILABLE", "Ответ удалён или недоступен", 404);
    const row = await tx.questionAnswer.create({
      data: {
        body: data.body,
        clientRequestId: data.clientRequestId,
        authorId: userId,
        questionId,
        parentId: target ? (target.parentId ?? target.id) : null,
        replyToId: target?.id ?? null,
      },
    });
    await bindPhotos(tx, userId, data.photoIds, { answerId: row.id });
    await tx.question.update({ where: { id: questionId }, data: { activityAt: new Date() } });
    await notify(
      tx,
      question.authorId,
      userId,
      questionId,
      "Новый ответ на ваш вопрос",
      question.title,
    );
    if (target && target.authorId !== question.authorId)
      await notify(
        tx,
        target.authorId,
        userId,
        questionId,
        "Ответ на ваш комментарий",
        question.title,
      );
    return { id: row.id };
  });
}
async function answerForMutation(tx: Tx, id: string) {
  const answer = await tx.questionAnswer.findFirst({ where: { id, ...available } });
  if (!answer) throw new QuestionError("NOT_FOUND", "Ответ удалён или недоступен", 404);
  await questionForActor(answer.questionId, tx, true);
  // Another mutation may have waited on the question lock.
  const current = await tx.questionAnswer.findFirst({ where: { id, ...available } });
  if (!current) throw new QuestionError("NOT_FOUND", "Ответ удалён или недоступен", 404);
  return current;
}
export async function editQuestionAnswer(userId: string, id: string, input: unknown) {
  const data = answerEditSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx, true);
    const row = await answerForMutation(tx, id);
    if (row.authorId !== actor.id)
      throw new QuestionError("FORBIDDEN", "Редактировать может только автор", 403);
    await bindPhotos(tx, userId, data.photoIds, { answerId: id }, true);
    await tx.questionAnswer.update({
      where: { id },
      data: { body: data.body, editedAt: new Date() },
    });
    return { id };
  });
}
export async function deleteQuestionAnswer(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx);
    const row = await answerForMutation(tx, id);
    requireOwner(actor, row.authorId);
    await tx.questionAnswer.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.question.updateMany({
      where: { id: row.questionId, bestAnswerId: id },
      data: { bestAnswerId: null },
    });
    return { id };
  });
}
export async function setQuestionHeart(userId: string, id: string, liked: boolean) {
  return prisma.$transaction(async (tx) => {
    await questionActor(userId, tx, true);
    const answer = await answerForMutation(tx, id);
    if (answer.authorId === userId)
      throw new QuestionError("OWN_HEART", "Нельзя поставить сердечко своему ответу");
    if (liked)
      await tx.questionHeart.upsert({
        where: { answerId_userId: { answerId: id, userId } },
        create: { answerId: id, userId },
        update: {},
      });
    else await tx.questionHeart.deleteMany({ where: { answerId: id, userId } });
    return { liked, hearts: await tx.questionHeart.count({ where: { answerId: id } }) };
  });
}
export async function setQuestionBestAnswer(userId: string, id: string, answerId: string | null) {
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx, true);
    const question = await questionForActor(id, tx, true);
    requireOwner(actor, question.authorId);
    const answer = answerId
      ? await tx.questionAnswer.findFirst({ where: { id: answerId, questionId: id, ...available } })
      : null;
    if (answerId && !answer)
      throw new QuestionError("INVALID_BEST_ANSWER", "Выберите доступный ответ на этот вопрос");
    await tx.question.update({ where: { id }, data: { bestAnswerId: answerId } });
    if (answer && question.bestAnswerId !== answer.id)
      await notify(tx, answer.authorId, userId, id, "Ваш ответ выбран лучшим", question.title);
    return { id };
  });
}
export async function setQuestionClosed(userId: string, id: string, closed: boolean) {
  return prisma.$transaction(async (tx) => {
    const actor = await questionActor(userId, tx, true);
    const question = await questionForActor(id, tx, true);
    requireOwner(actor, question.authorId);
    await tx.question.update({ where: { id }, data: { closedAt: closed ? new Date() : null } });
    return { id };
  });
}
export async function reportQuestion(userId: string, id: string, input: unknown) {
  const data = questionReportSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await questionActor(userId, tx, true);
    await questionForActor(id, tx, true);
    if (
      data.answerId &&
      !(await tx.questionAnswer.findFirst({
        where: { id: data.answerId, questionId: id, ...available },
      }))
    )
      throw new QuestionError("NOT_FOUND", "Ответ недоступен", 404);
    const targetKey = data.answerId ? `answer:${data.answerId}` : `question:${id}`;
    await tx.questionReport.upsert({
      where: { reporterId_targetKey: { reporterId: userId, targetKey } },
      create: { ...data, questionId: id, reporterId: userId, targetKey },
      update: {},
    });
    return { reported: true };
  });
}
