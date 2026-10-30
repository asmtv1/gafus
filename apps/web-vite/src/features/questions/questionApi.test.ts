import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQuestion, createQuestionAnswer, getQuestionOverview, listQuestionsPage,
  listQuestionReplies,
  setQuestionAnswerHeart, setQuestionBestAnswer, setQuestionClosed,
  editQuestionAnswer, deleteQuestionAnswer, editQuestion, deleteQuestion, reportQuestion,
} from "./questionApi";

const author = { id: "private-user-id", username: "trainer", name: "Автор", avatarUrl: "signed.jpg" };
const question = {
  id: "question-1", title: "Почему щенок тянет?", body: "Как научить идти рядом?",
  category: "Поведение", status: "waiting", author,
  tags: ["поводок"], createdAt: "2026-10-16T00:00:00.000Z", editedAt: null,
  answerCount: 1, viewCount: 5, closed: false, canManage: false,
  blockReason: null, canEdit: false, photos: [],
  bestAnswer: null,
  internalModeration: "secret",
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data, error: "Unreachable" }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("Vite questions client uses existing Hono envelope", () => {
  it("requests scoped list page with safe Next card projection and no raw media keys", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      items: [question], nextPage: 2, canPublish: true, blockReason: null,
    }));
    vi.stubGlobal("fetch", fetcher);
    const result = await listQuestionsPage({ page: 1, sort: "active", mine: true });
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/questions?page=1&sort=active&mine=true");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(result.nextPage).toBe(2);
    expect(result.items).toEqual([{ id: "question-1", title: question.title,
      preview: question.body, category: "Поведение", status: "waiting",
      authorName: "Автор", authorAvatarUrl: null, answerCount: 1,
      createdAt: question.createdAt, tags: ["поводок"], closed: false, viewCount: 5,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/private-user-id|signed.jpg|internalModeration/);
  });

  it("restores original image/avatar/count display only from safe author URL",async()=>{
    const input={...question,author:{...author,avatarUrl:"/uploads/avatar-safe.webp"},
      tags:["Натуралка"],viewCount:4};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({items:[input],
      nextPage:null,canPublish:true,blockReason:null})));
    const loaded=await listQuestionsPage();
    expect(loaded.items[0]).toMatchObject({
      authorAvatarUrl:"/uploads/avatar-safe.webp",tags:["Натуралка"],viewCount:4,
    });
    expect(JSON.stringify(loaded)).not.toMatch(/private-user-id|internalModeration/);
  });

  it("rejects unsafe author avatar without suppressing a valid question",async()=>{
    const input={...question,author:{...author,avatarUrl:"javascript:alert(1)"}};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({items:[input],
      nextPage:null,canPublish:false,blockReason:null})));
    const loaded=await listQuestionsPage();
    expect(loaded.items[0]?.authorAvatarUrl).toBeNull();
    expect(JSON.stringify(loaded)).not.toContain("javascript:alert");
  });

  it("detail retains only readable answer bodies, no signed photo or moderator rights", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({
      ...question, canReply: true, photos: [{ id: "secret", url: "signed.jpg" }],
      canManage: true, isAdmin: true, nextAnswerPage: null,
      answers: [{ id: "answer-1", body: "Спокойные упражнения", author,
        best: true, deleted: false, hidden: false, parentId: null, replyToName: null,
        replyCount: 0,
        photos: [{ id: "secret-photo", url: "signed-answer.jpg" }],
        canEdit: true, canDelete: true, liked: true, hearts: 5,
      }],
    })));
    vi.stubGlobal("fetch", fetcher);
    const detail = await getQuestionOverview("question-1");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/questions/question-1?page=1");
    expect(detail.body).toBe(question.body);
    expect(detail.canReply).toBe(true);
    expect(detail.answers).toEqual([{
      id: "answer-1", body: "Спокойные упражнения", authorName: "Автор",
      authorAvatarUrl: null,
      best: true, deleted: false, hidden: false,
      parentId: null, replyToName: null, replyCount: 0,
      canEdit: true, canDelete: true, photoIds: ["secret-photo"],
      liked: true, hearts: 5, canHeart: false,
    }]);
    expect(detail.canManage).toBe(true);
    expect(detail.tags).toEqual(["поводок"]);
    expect(detail.photoIds).toEqual(["secret"]);
    expect(detail.canEdit).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/signed|isAdmin|private-user-id/);
    const viewer = await getQuestionOverview("question-1", 1, "owner-2");
    expect(viewer.answers[0].canHeart).toBe(true);
    const mine = await getQuestionOverview("question-1", 1, author.id);
    expect(mine.answers[0].canHeart).toBe(false);
  });

  it("publishes using the shared server idempotent contract, no photos", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "question-A" }));
    vi.stubGlobal("fetch", fake);
    const id = await createQuestion({
      title: "  Как начать?  ", body: "  Что делать с поводком?  ",
      category: "Поведение", clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(id).toBe("question-A");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      title: "Как начать?", body: "Что делать с поводком?", category: "Поведение",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      tags: [], photoIds: [],
    });
  });

  it("question and reply creation forward uploaded photo IDs to unchanged Core JSON contract", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(response({ id: "question-new" }))
      .mockResolvedValueOnce(response({ id: "answer-new" }));
    vi.stubGlobal("fetch", fake);
    const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";
    expect(await createQuestion({
      title: "Помогите", body: "Собака боится улицы", category: "Поведение",
      clientRequestId, photoIds: ["photo-1", "photo-2"],
    })).toBe("question-new");
    expect(JSON.parse(fake.mock.calls[0][1].body).photoIds)
      .toEqual(["photo-1", "photo-2"]);
    expect(await createQuestionAnswer({
      questionId: "question-new", body: "Делайте упражнения",
      clientRequestId, replyToId: "answer-parent", photoIds: ["photo-3"],
    })).toBe("answer-new");
    expect(JSON.parse(fake.mock.calls[1][1].body)).toMatchObject({
      photoIds: ["photo-3"], replyToId: "answer-parent",
    });
  });

  it("rejects duplicate, excessive or unsafe photo IDs before attempting creation", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const basic = { title: "Вопрос", body: "Описание", category: "Поведение" as const,
      clientRequestId: id };
    await expect(createQuestion({ ...basic, photoIds: ["photo-x", "photo-x"] }))
      .rejects.toThrow("Проверьте");
    await expect(createQuestion({ ...basic, photoIds: ["../escape"] }))
      .rejects.toThrow("Проверьте");
    await expect(createQuestionAnswer({
      questionId: "question-1", body: "Ответ", clientRequestId: id,
      photoIds: ["a", "b", "c", "d", "e", "f"],
    })).rejects.toThrow("Проверьте");
    expect(fake).not.toHaveBeenCalled();
  });

  it("rejects invalid input or suspicious created ID without navigation", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "../outside" }));
    vi.stubGlobal("fetch", fake);
    const valid = { title: "Вопрос", body: "Описание", category: "Поведение" as const,
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000" };
    await expect(createQuestion({ ...valid, title: " " })).rejects.toThrow("данные");
    await expect(createQuestion({ ...valid, clientRequestId: "bad" })).rejects.toThrow("данные");
    expect(fake).not.toHaveBeenCalled();
    await expect(createQuestion(valid)).rejects.toThrow("идентификатор");
  });

  it("answers via the existing idempotent Hono POST with cookie credentials", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "answer-A" }));
    vi.stubGlobal("fetch", fake);
    const id = await createQuestionAnswer({
      questionId: "question-1", body: "  Тренируем спокойствие  ",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(id).toBe("answer-A");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1/answers");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      body: "Тренируем спокойствие", photoIds: [],
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects invalid answers, UUID and API response IDs before treating POST as success", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "../bad-answer" }));
    vi.stubGlobal("fetch", fake);
    const valid = {
      questionId: "question-1", body: "Упражнение",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    };
    await expect(createQuestionAnswer({ ...valid, questionId: "../users" }))
      .rejects.toThrow("данные");
    await expect(createQuestionAnswer({ ...valid, body: " " }))
      .rejects.toThrow("данные");
    await expect(createQuestionAnswer({ ...valid, clientRequestId: "x" }))
      .rejects.toThrow("данные");
    expect(fake).not.toHaveBeenCalled();
    await expect(createQuestionAnswer(valid)).rejects.toThrow("идентификатор");
  });

  it("nested answer attaches replyToId to the shared idempotent POST", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "answer-reply" }));
    vi.stubGlobal("fetch", fake);
    expect(await createQuestionAnswer({
      questionId: "question-1", body: "Спасибо за совет",
      replyToId: "answer-root",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    })).toBe("answer-reply");
    expect(JSON.parse(fake.mock.calls[0][1].body)).toMatchObject({
      replyToId: "answer-root", body: "Спасибо за совет", photoIds: [],
    });
    await expect(createQuestionAnswer({
      questionId: "question-1", body: "hello", replyToId: "../unsafe",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    })).rejects.toThrow("данные");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("reads paginated nested replies through Hono without signed media or author ids", async () => {
    const reply = {
      id: "nested-1", body: "Вложенный ответ",
      author: { id: "private-author", name: "Тренер", avatarUrl: "signed.jpg" },
      best: false, deleted: false, hidden: false,
      liked: false, hearts: 2, parentId: "answer-root", replyToName: "Автор",
      replyCount: 0, canEdit: false, canDelete: false,
      photos: [{ id: "media", url: "secret-signed-url" }],
    };
    const fake = vi.fn().mockResolvedValue(response({ items: [reply], nextPage: 2 }));
    vi.stubGlobal("fetch", fake);
    const data = await listQuestionReplies("answer-root", 1, "viewer-1", false);
    expect(fake.mock.calls[0][0])
      .toBe("/api/v1/questions/answers/answer-root/replies?page=1");
    expect(data).toEqual({ items: [{
      id: "nested-1", body: "Вложенный ответ", authorName: "Тренер",
      authorAvatarUrl: null,
      best: false, deleted: false, hidden: false, liked: false, hearts: 2,
      parentId: "answer-root", replyToName: "Автор", replyCount: 0,
      canEdit: false, canDelete: false, canHeart: true, photoIds: ["media"],
    }], nextPage: 2 });
    expect(JSON.stringify(data)).not.toMatch(/private-author|signed|secret-signed-url/);
  });

  it("passes a safe profile avatar for root and paged replies without exposing author ids", async () => {
    const picture = "/uploads/users/public/avatar.png";
    const answer = {
      id: "root-1", body: "Подсказка", best: false,
      deleted: false, hidden: false, liked: false, hearts: 0,
      parentId: null, replyToName: null, replyCount: 1,
      canEdit: false, canDelete: false, photos: [],
      author: { id: "SECRET_AUTHOR_ID", name: "Елена", avatarUrl: picture },
    };
    const fetcher = vi.fn((path: string) => Promise.resolve(response(
      path.includes("/replies?")
        ? { items: [{ ...answer, id: "child-1", parentId: "root-1" }], nextPage: null }
        : { ...question, answers: [answer], nextAnswerPage: null, canReply: true },
    )));
    vi.stubGlobal("fetch", fetcher);
    const overview = await getQuestionOverview("question-1");
    const nested = await listQuestionReplies("root-1", 1, "viewer-1", false);
    expect(overview.answers[0]?.authorAvatarUrl).toBe(picture);
    expect(nested.items[0]?.authorAvatarUrl).toBe(picture);
    expect(JSON.stringify({ overview, nested })).not.toContain("SECRET_AUTHOR_ID");

    const unsafe = { ...answer, author: { ...answer.author, avatarUrl: "javascript:alert(1)" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      ...question, answers: [unsafe], nextAnswerPage: null, canReply: true,
    })));
    const rejected = await getQuestionOverview("question-1");
    expect(rejected.answers[0]?.authorAvatarUrl).toBeNull();
    expect(JSON.stringify(rejected)).not.toContain("javascript:alert");
  });

  it("fails closed for malformed nested DTO and invalid root/page", async () => {
    const fake = vi.fn().mockResolvedValue(response({
      items: [{ id: "../bad" }], nextPage: null,
    }));
    vi.stubGlobal("fetch", fake);
    await expect(listQuestionReplies("../root", 1, "user-1", false))
      .rejects.toThrow("параметры");
    await expect(listQuestionReplies("answer-root", 0, "user-1", false))
      .rejects.toThrow("параметры");
    expect(fake).not.toHaveBeenCalled();
    await expect(listQuestionReplies("answer-root", 1, "user-1", false))
      .rejects.toThrow("некорректный ответ");
  });

  it("PATCH keeps existing photoIds to prevent accidental media unbinding", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "answer-A" }));
    vi.stubGlobal("fetch", fake);
    expect(await editQuestionAnswer({
      answerId: "answer-A", body: "  Более точный текст  ",
      photoIds: ["photo-1", "photo-2"],
    })).toBe("answer-A");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/answers/answer-A");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "PATCH", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      body: "Более точный текст", photoIds: ["photo-1", "photo-2"],
    });
  });

  it("PATCH and DELETE fail closed for invalid IDs, duplicate media or mismatched ACK", async () => {
    const fake = vi.fn().mockImplementation(() =>
      Promise.resolve(response({ id: "another-answer" })));
    vi.stubGlobal("fetch", fake);
    const answer = { answerId: "answer-A", body: "Исправлено", photoIds: ["photo-1"] };
    await expect(editQuestionAnswer({ ...answer, answerId: "../bad" }))
      .rejects.toThrow("Проверьте");
    await expect(editQuestionAnswer({ ...answer, photoIds: ["same", "same"] }))
      .rejects.toThrow("Проверьте");
    await expect(editQuestionAnswer({ ...answer, body: " " }))
      .rejects.toThrow("Проверьте");
    await expect(deleteQuestionAnswer("../bad")).rejects.toThrow("Некорректный");
    expect(fake).not.toHaveBeenCalled();
    await expect(editQuestionAnswer(answer)).rejects.toThrow("не подтвердил");
    await expect(deleteQuestionAnswer("answer-A")).rejects.toThrow("не подтвердил");
  });

  it("DELETE soft-removes answer only after validated server ID acknowledgment", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "answer-A" }));
    vi.stubGlobal("fetch", fake);
    await expect(deleteQuestionAnswer("answer-A")).resolves.toBe("answer-A");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/answers/answer-A");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "DELETE", credentials: "include", cache: "no-store",
    });
  });

  it("question PATCH preserves existing tags and photo IDs in Core payload", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "question-1" }));
    vi.stubGlobal("fetch", fake);
    expect(await editQuestion({
      questionId: "question-1", title: "  Новый заголовок  ",
      body: "  Исправленный текст  ", category: "Дрессировка",
      tags: ["щенок", "поводок"], photoIds: ["photo-1"],
    })).toBe("question-1");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "PATCH", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      title: "Новый заголовок", body: "Исправленный текст",
      category: "Дрессировка", tags: ["щенок", "поводок"], photoIds: ["photo-1"],
    });
  });

  it("question PATCH fails closed for invalid IDs, duplicate photos, and no server ACK", async () => {
    const fake = vi.fn().mockImplementation(() =>
      Promise.resolve(response({ id: "other-question" })));
    vi.stubGlobal("fetch", fake);
    const valid = { questionId: "question-1", title: "Вопрос", body: "Подробнее",
      category: "Поведение" as const, tags: ["тег"], photoIds: ["photo-1"] };
    await expect(editQuestion({ ...valid, questionId: "../bad" }))
      .rejects.toThrow("Проверьте");
    await expect(editQuestion({ ...valid, photoIds: ["photo-1", "photo-1"] }))
      .rejects.toThrow("Проверьте");
    await expect(editQuestion({ ...valid, body: "" })).rejects.toThrow("Проверьте");
    expect(fake).not.toHaveBeenCalled();
    await expect(editQuestion(valid)).rejects.toThrow("не подтвердил");
    await expect(deleteQuestion("question-1")).rejects.toThrow("не подтвердил");
  });

  it("question DELETE soft-deletes only after server acknowledgment", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "question-1" }));
    vi.stubGlobal("fetch", fake);
    await expect(deleteQuestion("question-1")).resolves.toBe("question-1");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/question-1");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "DELETE", credentials: "include", cache: "no-store",
    });
  });

  it("reports a question or a nested answer through existing server moderation", async () => {
    const fake = vi.fn().mockImplementation(() =>
      Promise.resolve(response({ reported: true })));
    vi.stubGlobal("fetch", fake);
    await expect(reportQuestion({
      questionId: "question-1", reason: "Спам", details: "  Реклама  ",
    })).resolves.toBe(true);
    await expect(reportQuestion({
      questionId: "question-1", answerId: "nested-1",
      reason: "Опасный совет", details: "Некорректная рекомендация",
    })).resolves.toBe(true);
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/questions/question-1/reports",
      "/api/v1/questions/question-1/reports",
    ]);
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", cache: "no-store", credentials: "include",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      reason: "Спам", details: "Реклама",
    });
    expect(JSON.parse(fake.mock.calls[1][1].body)).toEqual({
      answerId: "nested-1", reason: "Опасный совет",
      details: "Некорректная рекомендация",
    });
  });

  it("report rejects path-breaking targets, invalid reasons and forged acknowledgment", async () => {
    const fake = vi.fn().mockImplementation(() => Promise.resolve(response({
      reported: false,
    })));
    vi.stubGlobal("fetch", fake);
    const valid = { questionId: "question-1", reason: "Спам" as const, details: "" };
    await expect(reportQuestion({ ...valid, answerId: "../hack" }))
      .rejects.toThrow("Проверьте");
    await expect(reportQuestion({ ...valid, reason: "Unknown" as "Спам" }))
      .rejects.toThrow("Проверьте");
    await expect(reportQuestion({ ...valid, details: "x".repeat(1001) }))
      .rejects.toThrow("Проверьте");
    expect(fake).not.toHaveBeenCalled();
    await expect(reportQuestion(valid)).rejects.toThrow("не подтвердил");
  });

  it("uses explicit idempotent heart add/remove through existing Hono", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(response({ liked: true, hearts: 8 }))
      .mockResolvedValueOnce(response({ liked: false, hearts: 7 }));
    vi.stubGlobal("fetch", fake);
    expect(await setQuestionAnswerHeart("answer-1", true)).toEqual({
      liked: true, hearts: 8,
    });
    expect(await setQuestionAnswerHeart("answer-1", false)).toEqual({
      liked: false, hearts: 7,
    });
    expect(fake).toHaveBeenCalledTimes(2);
    expect(fake.mock.calls[0][0]).toBe("/api/v1/questions/answers/answer-1/heart");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "POST", credentials: "include", cache: "no-store",
    });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({ liked: true });
    expect(JSON.parse(fake.mock.calls[1][1].body)).toEqual({ liked: false });
  });

  it("rejects invalid heart ID and suspicious acknowledgement before success", async () => {
    const fake = vi.fn().mockResolvedValue(response({ liked: "true", hearts: -1 }));
    vi.stubGlobal("fetch", fake);
    await expect(setQuestionAnswerHeart("../hidden", true)).rejects.toThrow("Некорректный");
    await expect(setQuestionAnswerHeart("answer-1", "true" as unknown as boolean))
      .rejects.toThrow("Некорректный");
    expect(fake).not.toHaveBeenCalled();
    await expect(setQuestionAnswerHeart("answer-1", true))
      .rejects.toThrow("некорректную отметку");
  });

  it("question management uses explicit best/close operations with server acknowledgement", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ id: "question-1" }))
      .mockResolvedValueOnce(response({ id: "question-1" }))
      .mockResolvedValueOnce(response({ id: "question-1" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await setQuestionClosed("question-1", true)).toBe("question-1");
    expect(await setQuestionBestAnswer("question-1", "answer-1")).toBe("question-1");
    expect(await setQuestionBestAnswer("question-1", null)).toBe("question-1");
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/questions/question-1/close",
      "/api/v1/questions/question-1/best",
      "/api/v1/questions/question-1/best",
    ]);
    expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body))).toEqual([
      { closed: true }, { answerId: "answer-1" }, { answerId: null },
    ]);
    expect(fetcher.mock.calls.every(call => call[1].method === "POST" &&
      call[1].credentials === "include")).toBe(true);
  });

  it("management refuses unsafe identifiers and mismatched Hono acknowledgements", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(
      response({ id: "different-question" }),
    ));
    vi.stubGlobal("fetch", fetcher);
    await expect(setQuestionClosed("../admin", true)).rejects.toThrow("Некорректный");
    await expect(setQuestionBestAnswer("question-1", "../other"))
      .rejects.toThrow("Некорректный");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(setQuestionClosed("question-1", false)).rejects.toThrow("не подтвердил");
    await expect(setQuestionBestAnswer("question-1", "answer-1"))
      .rejects.toThrow("не подтвердил");
  });

  it("rejects missing server-owned reply permission in question detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      ...question, nextAnswerPage: null, answers: [], canReply: "true",
    })));
    await expect(getQuestionOverview("question-1")).rejects.toThrow("некорректный вопрос");
  });

  it("invalid sort/page and unsafe IDs fail before network call", async () => {
    const fake = vi.fn(); vi.stubGlobal("fetch", fake);
    await expect(listQuestionsPage({ page: 0 })).rejects.toThrow("параметры");
    await expect(listQuestionsPage({ sort: "hacked" as "new" })).rejects.toThrow("параметры");
    await expect(getQuestionOverview("../user")).rejects.toThrow("идентификатор");
    expect(fake).not.toHaveBeenCalled();
  });

  it("malformed data or HTTP failure never resolves as an empty valid feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({
      items: [{ ...question, id: "../owner" }], nextPage: null,
      canPublish: false, blockReason: null,
    })).mockResolvedValueOnce(response(null, 503)));
    await expect(listQuestionsPage()).rejects.toThrow("вопрос");
    await expect(listQuestionsPage()).rejects.toMatchObject({ status: 503 });
  });
});
