import { describe, expect, it, vi } from "vitest";
const core = vi.hoisted(() => ({ listQuestions: vi.fn(), createQuestion: vi.fn(), uploadQuestionPhoto: vi.fn(), getQuestionPhotoProcessingStatus: vi.fn(), setQuestionHeart: vi.fn() }));
vi.mock("@gafus/core/services/questions", () => ({
  ...core,
  QuestionError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message); } },
  questionHttpError: vi.fn(),
  deleteUnusedQuestionPhoto: vi.fn(), getQuestionModeration: vi.fn(), moderateQuestionReport: vi.fn(), unblockQuestionsUser: vi.fn(),
}));
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
  it("decodes multipart bytes and leaves file inspection to core", async () => {
    const form = new FormData(); form.append("file", new Blob([new Uint8Array([1, 2, 3])]), "photo.jpg");
    await dispatchQuestionsRequest("account-1", new Request("https://example.test/questions/photos", { method: "POST", body: form }), "photos");
    expect(core.uploadQuestionPhoto).toHaveBeenCalledWith(
      "account-1", new Uint8Array([1, 2, 3]),
    );
  });
  it("uses the same processing pipeline even when the obsolete header is present", async () => {
    const form = new FormData();
    form.append("file",new Blob([new Uint8Array([1, 2, 3])]),"photo.jpg");
    await dispatchQuestionsRequest("account-1",new Request("https://example.test/questions/photos",{
      method:"POST",headers:{"X-Gafus-Questions-Async":"1"},body:form,
    }),"photos");
    expect(core.uploadQuestionPhoto).toHaveBeenLastCalledWith(
      "account-1",new Uint8Array([1, 2, 3]),
    );
  });
  it("routes authenticated photo readiness reads to the exact owner-scoped status method", async () => {
    core.getQuestionPhotoProcessingStatus.mockResolvedValueOnce({id:"photo-id",url:"",processing:true});
    expect(await dispatchQuestionsRequest("account-1",
      new Request("https://example.test/questions/photos/photo-id"), "photos/photo-id"))
      .toEqual({id:"photo-id",url:"",processing:true});
    expect(core.getQuestionPhotoProcessingStatus).toHaveBeenCalledWith("account-1","photo-id");
  });
  it("returns 404 for unsupported routes and methods", async () => {
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions", { method: "PUT" }), "")).rejects.toMatchObject({ status: 404 });
    await expect(dispatchQuestionsRequest("account-1", new Request("https://example.test/questions/answers"), "answers")).rejects.toMatchObject({ status: 404 });
  });
});
