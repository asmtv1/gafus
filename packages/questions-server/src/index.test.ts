import { describe, expect, it, vi } from "vitest";
const core = vi.hoisted(() => ({ listQuestions: vi.fn(), createQuestion: vi.fn(), setQuestionHeart: vi.fn() }));
vi.mock("./service.js", () => ({
  ...core,
  QuestionError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message); } },
  questionHttpError: vi.fn(),

}));
const moderation = vi.hoisted(() => ({ get: vi.fn(), act: vi.fn(), unblock: vi.fn() }));
vi.mock("./moderation.js", () => ({
  getQuestionModeration: moderation.get,
  moderateQuestionReport: moderation.act,
  unblockQuestionsUser: moderation.unblock,
}));
vi.mock("./photos.js",()=>({deleteUnusedQuestionPhoto:vi.fn()}));
import { dispatchQuestionsRequest } from "./index";
describe("questions HTTP decoding", () => {
  it("passes query data and the authenticated actor to core", async () => {
    await dispatchQuestionsRequest("account-1", new Request("https://example.test/questions?mine=true&category=Поведение"), "");
    expect(core.listQuestions).toHaveBeenCalledWith("account-1", { mine: "true", category: "Поведение" });
  });
  it("decodes a mutation without making business decisions", async () => {
    const input = { title: "Прогулки", body: "Вопрос", category: "Поведение" };
    await dispatchQuestionsRequest("account-1", new Request("https://example.test/questions", { method: "POST", body: JSON.stringify(input) }), "");
    expect(core.createQuestion).toHaveBeenCalledWith("account-1", input);
  });
  it("rejects oversized JSON before passing it to core", async () => {
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions", { method: "POST", body: "x".repeat(100001) }), "")).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed hearts instead of coercing arbitrary values", async () => {
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions/answers/a/heart", { method: "POST", body: '{"liked":"true"}' }), "answers/a/heart")).rejects.toBeDefined();
    expect(core.setQuestionHeart).not.toHaveBeenCalled();
  });
  it("rejects old backend multipart upload instead of keeping a second pipeline", async () => {
    const form=new FormData();
    form.append("file",new Blob([new Uint8Array([1,2,3])]),"photo.jpg");
    await expect(dispatchQuestionsRequest("account-1",
      new Request("https://example.test/questions/photos",{method:"POST",body:form}),
      "photos")).rejects.toMatchObject({status:410,code:"PHOTO_UPLOAD_V2_REQUIRED"});
  });
  it("routes moderation with the authenticated actor and keeps it outside Core", async () => {
    await dispatchQuestionsRequest("admin-user", new Request("https://example.test/questions/moderation?page=2"), "moderation");
    expect(moderation.get).toHaveBeenCalledWith("admin-user", 2);
    const payload = { reportId: "report-A", action: "hide", reason: "Спам" };
    await dispatchQuestionsRequest("admin-user", new Request("https://example.test/questions/moderation", {
      method: "POST", body: JSON.stringify(payload),
    }), "moderation");
    expect(moderation.act).toHaveBeenCalledWith("admin-user", payload);
    await dispatchQuestionsRequest("admin-user", new Request("https://example.test/questions/moderation/blocks/user-B", {
      method: "DELETE",
    }), "moderation/blocks/user-B");
    expect(moderation.unblock).toHaveBeenCalledWith("admin-user", "user-B");
  });
  it("returns 404 for unsupported routes and methods", async () => {
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions", { method: "PUT" }), "")).rejects.toMatchObject({ status: 404 });
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions/answers"), "answers")).rejects.toMatchObject({ status: 404 });
  });
});
