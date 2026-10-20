import { describe, expect, it, vi } from "vitest";
const core = vi.hoisted(() => ({ listQuestions: vi.fn(), createQuestion: vi.fn(), uploadQuestionPhoto: vi.fn(), getQuestionPhotoProcessingStatus: vi.fn(), setQuestionHeart: vi.fn() }));
vi.mock("@gafus/core/services/questions", () => ({
  ...core,
  QuestionError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message); } },
  questionHttpError: vi.fn(),
  deleteUnusedQuestionPhoto: vi.fn(), getQuestionModeration: vi.fn(), moderateQuestionReport: vi.fn(), unblockQuestionsUser: vi.fn(),
}));
import { awaitQuestionPhotoReady, dispatchQuestionsRequest } from "./index";
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
  it("returns a ready public URL to already installed Mobile clients without async opt-in", async () => {
    core.uploadQuestionPhoto.mockResolvedValueOnce({id:"photo-id",url:"",processing:true});
    core.getQuestionPhotoProcessingStatus.mockResolvedValueOnce({
      id:"photo-id",url:"",processing:true,
    }).mockResolvedValueOnce({
      id:"photo-id",url:"https://ebiteskukingusk.begetcdn.cloud/questions/u/id/full.webp",
      processing:false,
    });
    const form = new FormData();
    form.append("file",new Blob([new Uint8Array([1, 2, 3])]),"photo.jpg");
    const result = await dispatchQuestionsRequest("account-1", new Request(
      "https://example.test/questions/photos",{method:"POST",body:form},
    ),"photos");
    expect(core.uploadQuestionPhoto).toHaveBeenCalledWith(
      "account-1",new Uint8Array([1, 2, 3]),
    );
    expect(core.getQuestionPhotoProcessingStatus).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({id:"photo-id",processing:false,
      url:expect.stringContaining("ebiteskukingusk.begetcdn.cloud")});
  });
  it("returns immediately with processing state for async Web/Mobile clients", async () => {
    core.getQuestionPhotoProcessingStatus.mockClear();
    core.uploadQuestionPhoto.mockResolvedValueOnce({id:"photo-id",url:"",processing:true});
    const form = new FormData();
    form.append("file",new Blob([new Uint8Array([1, 2, 3])]),"photo.jpg");
    const response = await dispatchQuestionsRequest("account-1",new Request(
      "https://example.test/questions/photos",{
        method:"POST",headers:{"X-Gafus-Questions-Async":"1"},body:form,
      }),"photos");
    expect(response).toEqual({id:"photo-id",url:"",processing:true});
    expect(core.getQuestionPhotoProcessingStatus).not.toHaveBeenCalled();
  });
  it("fails with an actionable status instead of handing old clients a blank photo", async () => {
    core.getQuestionPhotoProcessingStatus.mockReset();
    core.getQuestionPhotoProcessingStatus.mockResolvedValue({
      id:"photo-id",url:"",processing:true,
    });
    let clock = 0;
    await expect(awaitQuestionPhotoReady("account-1","photo-id",{
      now:() => clock, sleep: async ms => {clock += ms;}, maxWaitMs:2500,
    })).rejects.toMatchObject({code:"PHOTO_STILL_PROCESSING",status:503});
    expect(core.getQuestionPhotoProcessingStatus).toHaveBeenCalledTimes(3);
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
