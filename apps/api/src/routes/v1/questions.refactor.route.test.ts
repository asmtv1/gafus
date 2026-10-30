import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(), error: vi.fn(),
  reservePhoto:vi.fn(), confirmPhoto:vi.fn(),
  statusPhoto:vi.fn(),discardPhoto:vi.fn(),
}));
vi.mock("@gafus/questions-server", () => ({
  dispatchQuestionsRequest: mocks.dispatch,
  questionHttpError: mocks.error,
}));
vi.mock("../../modules/questions/media-v2-upload.js",()=>({
  reserveQuestionsPhoto:mocks.reservePhoto,
  confirmQuestionsPhoto:mocks.confirmPhoto,
  statusQuestionsPhoto:mocks.statusPhoto,
  discardQuestionsV2Photo:mocks.discardPhoto,
}));
import { questionsRoutes } from "./questions";
import {
  listQuestionsPage, getQuestionOverview, createQuestion, createQuestionAnswer,
  listQuestionReplies,
  setQuestionAnswerHeart, setQuestionBestAnswer, setQuestionClosed,
  editQuestionAnswer, deleteQuestionAnswer, editQuestion, deleteQuestion, reportQuestion,
} from
  "../../../../../apps/web-vite/src/features/questions/questionApi";

const actor = { id: "user-A", username: "a", role: "USER" } as const;
function app() {
  const api = new Hono();
  api.use("/api/v1/questions/*", async (c, next) => {
    c.set("user", actor);
    await next();
  });
  api.route("/api/v1/questions", questionsRoutes);
  return api;
}

const author = { id: "hidden-user-id", name: "Ольга", avatarUrl: "secret.jpg" };
const item = {
  id: "question-A", title: "Почему собака лает?", body: "Как её успокоить?",
  category: "Поведение", status: "waiting", author,
  answerCount: 0, createdAt: "2026-10-16T00:00:00.000Z", closed: false,
  canManage: false, canEdit: false, blockReason: null,
  tags: [], photos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.error.mockImplementation(() => ({
    status: 503, body: { success: false, error: "Временная ошибка сервера" },
  }));
});

describe("Hono questions-server reused by Vite browser questions", () => {
  it("list delegates to questions-server with actor and paging, no-store", async () => {
    mocks.dispatch.mockResolvedValue({
      items: [item], nextPage: null, canPublish: true, blockReason: null,
    });
    const res = await app().request("/api/v1/questions?page=1&sort=new&mine=false");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "",
    );
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    const page = await listQuestionsPage();
    expect(page.items[0].title).toBe(item.title);
    expect(JSON.stringify(page)).not.toContain("hidden-user-id");
  });

  it("detail uses existing questions-server and hides private properties in Vite", async () => {
    mocks.dispatch.mockResolvedValue({
      ...item, canReply: true, nextAnswerPage: null,
      photos: [{ id: "private", url: "signed-url" }],
      answers: [{ id: "answer-A", body: "Плавное привыкание", author,
        best: false, deleted: false, hidden: false, parentId: null, replyToName: null,
      replyCount: 0, canEdit: false, canDelete: false, liked: false, hearts: 1,
        photos: [{ id: "private", url: "signed-photo" }],
      }],
    });
    const response = await app().request("/api/v1/questions/question-A?page=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/question-A",
    );
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    const question = await getQuestionOverview("question-A");
    expect(question.answers[0].body).toBe("Плавное привыкание");
    expect(JSON.stringify(question)).not.toMatch(/hidden-user-id|signed-url|signed-photo/);
  });

  it("creation reuses questions-server with authenticated actor and stable UUID", async () => {
    mocks.dispatch.mockResolvedValue({ id: "question-new" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method, headers: options.headers,
        body: options.body }),
    ));
    const id = await createQuestion({ title: "Щенок", body: "Как учить?",
      category: "Поведение", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(id).toBe("question-new");
    expect(mocks.dispatch).toHaveBeenCalledWith(actor.id, expect.any(Request), "");
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(sent.method).toBe("POST");
    const body = await sent.json();
    expect(body).toMatchObject({ clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Щенок", tags: [], photoIds: [] });
  });

  it("new Vite answers reuse the same questions-server contract as Mobile", async () => {
    mocks.dispatch.mockResolvedValue({ id: "answer-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method, headers: options.headers,
        body: options.body }),
    ));
    const id = await createQuestionAnswer({
      questionId: "question-A", body: "  Постепенно приучайте  ",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(id).toBe("answer-A");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/question-A/answers",
    );
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(sent.method).toBe("POST");
    expect(await sent.json()).toEqual({
      body: "Постепенно приучайте", photoIds: [],
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("nested reply route delegates parent and paginated GET to questions-server", async () => {
    mocks.dispatch.mockResolvedValue({ items: [], nextPage: null });
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    expect(await listQuestionReplies("answer-root", 2, "viewer-1", false))
      .toEqual({ items: [], nextPage: null });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/answers/answer-root/replies",
    );
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(new URL(sent.url).searchParams.get("page")).toBe("2");
  });

  it("nested reply POST preserves the shared Core replyToId and UUID", async () => {
    mocks.dispatch.mockResolvedValue({ id: "answer-nested" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await createQuestionAnswer({
      questionId: "question-A", body: "Ответ на комментарий",
      replyToId: "answer-parent",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    })).toBe("answer-nested");
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(await sent.json()).toMatchObject({
      replyToId: "answer-parent", body: "Ответ на комментарий",
    });
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/question-A/answers");
  });

  it("answer edit preserves photo list through existing PATCH Hono/Core", async () => {
    mocks.dispatch.mockResolvedValue({ id: "answer-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await editQuestionAnswer({
      answerId: "answer-A", body: "Уточнение",
      photoIds: ["photo-1"],
    })).toBe("answer-A");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/answers/answer-A",
    );
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(sent.method).toBe("PATCH");
    expect(await sent.json()).toEqual({ body: "Уточнение", photoIds: ["photo-1"] });
  });

  it("answer delete calls only existing Core soft-delete endpoint", async () => {
    mocks.dispatch.mockResolvedValue({ id: "answer-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method, headers: options.headers }),
    ));
    expect(await deleteQuestionAnswer("answer-A")).toBe("answer-A");
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/answers/answer-A",
    );
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("DELETE");
  });

  it("question PATCH preserves existing tags/media through old Hono routing", async () => {
    mocks.dispatch.mockResolvedValue({ id: "question-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await editQuestion({ questionId: "question-A", title: "Изменения",
      body: "Текст", category: "Поведение", tags: ["обучение"], photoIds: ["photo-1"],
    })).toBe("question-A");
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/question-A");
    expect(sent.method).toBe("PATCH");
    expect(await sent.json()).toEqual({
      title: "Изменения", body: "Текст", category: "Поведение",
      tags: ["обучение"], photoIds: ["photo-1"],
    });
  });

  it("question DELETE reuses Core soft-delete with no new permission model", async () => {
    mocks.dispatch.mockResolvedValue({ id: "question-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, { method: options.method, headers: options.headers }),
    ));
    expect(await deleteQuestion("question-A")).toBe("question-A");
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/question-A");
    expect((mocks.dispatch.mock.calls[0][1] as Request).method).toBe("DELETE");
  });

  it("report reuses questions-server idempotent reporter target and reason contract", async () => {
    mocks.dispatch.mockResolvedValue({ reported: true });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await reportQuestion({
      questionId: "question-A", answerId: "answer-A",
      reason: "Оскорбления", details: "Текст",
    })).toBe(true);
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/question-A/reports",
    );
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(sent.method).toBe("POST");
    expect(await sent.json()).toEqual({
      answerId: "answer-A", reason: "Оскорбления", details: "Текст",
    });
  });

  it("Vite hearts retain the idempotent Hono and Core explicit liked contract", async () => {
    mocks.dispatch.mockResolvedValue({ liked: true, hearts: 9 });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await setQuestionAnswerHeart("answer-A", true)).toEqual({
      liked: true, hearts: 9,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      actor.id, expect.any(Request), "/answers/answer-A/heart",
    );
    const sent = mocks.dispatch.mock.calls[0][1] as Request;
    expect(sent.method).toBe("POST");
    expect(await sent.json()).toEqual({ liked: true });
  });

  it("best answer and discussion close delegate exact commands to questions-server", async () => {
    mocks.dispatch.mockResolvedValue({ id: "question-A" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method, headers: options.headers, body: options.body,
      }),
    ));
    expect(await setQuestionBestAnswer("question-A", "answer-A")).toBe("question-A");
    expect(await setQuestionClosed("question-A", true)).toBe("question-A");
    expect(mocks.dispatch).toHaveBeenCalledTimes(2);
    expect(mocks.dispatch.mock.calls[0][2]).toBe("/question-A/best");
    expect(mocks.dispatch.mock.calls[1][2]).toBe("/question-A/close");
    const payload1 = await (mocks.dispatch.mock.calls[0][1] as Request).json();
    const payload2 = await (mocks.dispatch.mock.calls[1][1] as Request).json();
    expect(payload1).toEqual({ answerId: "answer-A" });
    expect(payload2).toEqual({ closed: true });
  });

  it("rejects retired multipart upload with 410, never sends photo bytes to Core",async()=>{
    const form=new FormData();
    form.append("file",new Blob([new Uint8Array([255,216,255])],
      {type:"image/jpeg"}),"dog.jpg");
    const response=await app().request("/api/v1/questions/photos",
      {method:"POST",body:form});
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).code).toBe("PHOTO_UPLOAD_V2_REQUIRED");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.reservePhoto).not.toHaveBeenCalled();
  });
  it("reserves direct S3 upload with the authenticated owner and strict JSON",async()=>{
    mocks.reservePhoto.mockResolvedValue({id:"photo-1",status:"AWAITING_UPLOAD",
      upload:{method:"POST",url:"https://isolated-s3.example",fields:{key:"synthetic"}}});
    const response=await app().request("/api/v1/questions/photos/reservations",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({mime:"image/jpeg",bytes:1200}),
    });
    expect(response.status).toBe(201);
    expect(mocks.reservePhoto).toHaveBeenCalledWith(actor.id,{mime:"image/jpeg",bytes:1200});
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("discarding a V2 unbound photo enforces ownership in shared Core",async()=>{
    mocks.discardPhoto.mockResolvedValue({id:"photo-1"});
    const response=await app().request("/api/v1/questions/photos/photo-1",{method:"DELETE"});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.discardPhoto).toHaveBeenCalledWith(actor.id,"photo-1");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("backend failure is 503, not a false empty list or cached response", async () => {
    mocks.dispatch.mockRejectedValue(new Error("isolated-database-down"));
    const response = await app().request("/api/v1/questions?page=1");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    vi.stubGlobal("fetch", vi.fn((path: string) => app().request(path)));
    await expect(listQuestionsPage()).rejects.toMatchObject({ status: 503 });
  });
});
