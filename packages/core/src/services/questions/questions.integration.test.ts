import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createQuestion,
  createQuestionAnswer,
  deleteQuestionAnswer,
  editQuestion,
  getQuestion,
  listQuestions,
  reportQuestion,
  setQuestionBestAnswer,
  setQuestionClosed,
  setQuestionHeart,
} from "./service";
import { getQuestionModeration, moderateQuestionReport, unblockQuestionsUser } from "./moderation";
// Explicit opt-in: these tests are only run against a disposable local database.
const enabled =
  process.env.QUESTIONS_TEST_DATABASE_URL === process.env.DATABASE_URL &&
  !!process.env.DATABASE_URL?.includes("gafus_questions_qa");
const ids = {
  owner: `q-owner-${randomUUID()}`,
  other: `q-other-${randomUUID()}`,
  admin: `q-admin-${randomUUID()}`,
  quota: `q-quota-${randomUUID()}`,
};
const input = (title = "Как приучить щенка к прогулке?") => ({
  title,
  body: "Щенок волнуется на улице. Что помогло вам?",
  category: "Поведение",
  tags: ["щенок"],
  photoIds: [],
  clientRequestId: randomUUID(),
});
let questionId: string;
let answerId: string;
describe.skipIf(!enabled)("questions transactional business rules (PostgreSQL)", () => {
  beforeAll(async () => {
    for (const [role, id] of Object.entries(ids))
      await prisma.user.create({
        data: {
          id,
          username: id,
          password: randomUUID(),
          role: role === "admin" ? "ADMIN" : "USER",
        },
      });
    questionId = (await createQuestion(ids.owner, input())).id;
    answerId = (
      await createQuestionAnswer(ids.other, questionId, {
        body: "Начните с коротких прогулок.",
        photoIds: [],
        clientRequestId: randomUUID(),
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });
  it("requires an existing authenticated actor for reads", async () => {
    await expect(listQuestions("missing", {})).rejects.toMatchObject({ status: 401 });
  });
  it("returns one view per account, regardless of repeated opens", async () => {
    await getQuestion(ids.owner, questionId, {});
    await getQuestion(ids.owner, questionId, {});
    expect(await prisma.questionView.count({ where: { questionId, userId: ids.owner } })).toBe(1);
  });
  it("creation retries are idempotent", async () => {
    const payload = input("Повторный запрос");
    const [a, b] = await Promise.all([
      createQuestion(ids.owner, payload),
      createQuestion(ids.owner, payload),
    ]);
    expect(a.id).toBe(b.id);
  });
  it("serializes the rolling daily quota across concurrent requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 7 }, () => createQuestion(ids.quota, input())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => r.status === "rejected" && r.reason.status === 429),
    ).toBe(true);
  });
  it("does not allow editing another author's question", async () => {
    await expect(editQuestion(ids.other, questionId, input())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects invalid categories, too many tags and a sixth photo", async () => {
    await expect(
      createQuestion(ids.owner, { ...input(), category: "unknown" }),
    ).rejects.toBeDefined();
    await expect(
      createQuestion(ids.owner, { ...input(), tags: ["1", "2", "3", "4", "5", "6"] }),
    ).rejects.toBeDefined();
    await expect(
      createQuestion(ids.owner, { ...input(), photoIds: ["1", "2", "3", "4", "5", "6"] }),
    ).rejects.toBeDefined();
  });
  it("cannot attach another user's photo", async () => {
    const photo = await prisma.questionPhoto.create({
      data: { ownerId: ids.other, url: "https://example.com/photo.jpg", storagePath: "test-photo" },
    });
    await expect(
      createQuestion(ids.owner, { ...input(), photoIds: [photo.id] }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("hearts are idempotent, reversible, and unavailable on own answers", async () => {
    await setQuestionHeart(ids.owner, answerId, true);
    await setQuestionHeart(ids.owner, answerId, true);
    expect(await prisma.questionHeart.count({ where: { answerId } })).toBe(1);
    await setQuestionHeart(ids.owner, answerId, false);
    expect(await prisma.questionHeart.count({ where: { answerId } })).toBe(0);
    await expect(setQuestionHeart(ids.other, answerId, true)).rejects.toMatchObject({
      code: "OWN_HEART",
    });
  });
  it("only author/admin can select a best answer, from this question", async () => {
    await expect(setQuestionBestAnswer(ids.other, questionId, answerId)).rejects.toMatchObject({
      status: 403,
    });
    const otherQuestion = (await createQuestion(ids.admin, input())).id;
    await expect(setQuestionBestAnswer(ids.admin, otherQuestion, answerId)).rejects.toMatchObject({
      code: "INVALID_BEST_ANSWER",
    });
    await setQuestionBestAnswer(ids.owner, questionId, answerId);
    expect((await getQuestion(ids.owner, questionId, {})).status).toBe("resolved");
  });
  it("keeps nested replies at one visual level", async () => {
    const first = await createQuestionAnswer(ids.owner, questionId, {
      body: "Спасибо за опыт",
      replyToId: answerId,
      clientRequestId: randomUUID(),
    });
    const nested = await createQuestionAnswer(ids.other, questionId, {
      body: "Рад помочь",
      replyToId: first.id,
      clientRequestId: randomUUID(),
    });
    const row = await prisma.questionAnswer.findUniqueOrThrow({ where: { id: nested.id } });
    expect(row.parentId).toBe(answerId);
    expect(row.replyToId).toBe(first.id);
  });
  it("closed questions reject new answers, then can reopen", async () => {
    await setQuestionClosed(ids.owner, questionId, true);
    await expect(
      createQuestionAnswer(ids.other, questionId, {
        body: "Ещё ответ",
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "QUESTION_CLOSED" });
    await setQuestionClosed(ids.owner, questionId, false);
  });
  it("deleted best answer resets resolution and preserves child replies as a tombstone", async () => {
    await deleteQuestionAnswer(ids.other, answerId);
    const question = await getQuestion(ids.owner, questionId, {});
    expect(question.status).toBe("answered");
    expect(question.bestAnswer).toBeNull();
    expect(question.answers.find((a) => a.id === answerId)?.body).toBe("Ответ удалён");
    expect(question.answers.some((a) => a.parentId === answerId)).toBe(true);
  });
  it("admin can ban only question publishing and reverse it", async () => {
    await reportQuestion(ids.other, questionId, { reason: "Спам" });
    const report = (await getQuestionModeration(ids.admin)).reports.find(
      (r) => r.questionId === questionId,
    )!;
    await expect(getQuestionModeration(ids.other)).rejects.toMatchObject({ status: 403 });
    await moderateQuestionReport(ids.admin, {
      reportId: report.id,
      action: "block",
      reason: "Спам",
    });
    expect((await listQuestions(ids.owner, {})).canPublish).toBe(false);
    await expect(createQuestion(ids.owner, input())).rejects.toMatchObject({
      code: "QUESTIONS_BLOCKED",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } })).role).toBe("USER");
    await unblockQuestionsUser(ids.admin, ids.owner);
    expect((await listQuestions(ids.owner, {})).canPublish).toBe(true);
  });
  it("enforces the hourly answer quota, counting deleted publications too", async () => {
    await prisma.questionAnswer.createMany({
      data: Array.from({ length: 30 }, () => ({
        questionId,
        authorId: ids.quota,
        body: "Пример",
        clientRequestId: randomUUID(),
        deletedAt: new Date(),
      })),
    });
    await expect(
      createQuestionAnswer(ids.quota, questionId, {
        body: "Ещё ответ",
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMIT" });
  });
  it("persists notifications atomically, avoids self notifications and reply duplicates", async () => {
    await prisma.pushSubscription.createMany({
      data: [
        { userId: ids.owner, endpoint: `expo:questions-owner-${ids.owner}`, keys: {} },
        { userId: ids.other, endpoint: `expo:questions-other-${ids.other}`, keys: {} },
      ],
    });
    const q = (await createQuestion(ids.admin, input("Проверка уведомлений"))).id;
    const first = await createQuestionAnswer(ids.owner, q, {
      body: "Ответ автора комментария",
      clientRequestId: randomUUID(),
    });
    await createQuestionAnswer(ids.other, q, {
      body: "Ответ на комментарий",
      replyToId: first.id,
      clientRequestId: randomUUID(),
    });
    const ownerNotifications = await prisma.stepNotification.count({
      where: { userId: ids.owner, url: `/questions/${q}` },
    });
    expect(ownerNotifications).toBe(1);
    await setQuestionBestAnswer(ids.admin, q, first.id);
    expect(
      await prisma.stepNotification.count({ where: { userId: ids.owner, url: `/questions/${q}` } }),
    ).toBe(2);
  });
  it("parallel replies with notifications do not deadlock on recipient user locks", async () => {
    const q = (await createQuestion(ids.owner, input("Параллельное обсуждение"))).id;
    const first = await createQuestionAnswer(ids.other, q, {
      body: "Первый ответ",
      clientRequestId: randomUUID(),
    });
    const results = await Promise.all([
      createQuestionAnswer(ids.owner, q, {
        body: "Ответ владельца вопроса",
        replyToId: first.id,
        clientRequestId: randomUUID(),
      }),
      createQuestionAnswer(ids.other, q, {
        body: "Ещё один комментарий",
        clientRequestId: randomUUID(),
      }),
    ]);
    expect(results).toHaveLength(2);
  });
});