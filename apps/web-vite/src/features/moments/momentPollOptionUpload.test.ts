import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentInlinePollDraft } from "./MomentInlinePoll";
import { uploadMomentPollOptionImages } from "./momentPollOptionUpload";
import { uploadMomentPhoto, validateMomentPhoto } from "./feedMediaTransfer";
import { feedClient } from "./feedClient";
vi.mock("./feedMediaTransfer", () => ({
  uploadMomentPhoto: vi.fn(), validateMomentPhoto: vi.fn(),
}));
vi.mock("./feedClient", () => ({feedClient: { reserveUpload: vi.fn() }}));
const reqId = "550e8400-e29b-41d4-a716-446655440000";
const file = new File(["dog"], "dog.webp", { type: "image/webp" });
const poll: MomentInlinePollDraft = {
  question: "Какой питомец?", options: [
    {text: "Собака", imageAsset: {
      file, requestId: reqId, bytes: file.size, previewUri: "blob:private-preview",
    }}, {text: "Кошка"},
  ],
  isQuiz: false, allowMultiple: false, isAnonymous: false,
  hideResults: false, shuffleOptions: false, endDate: null,
};
const progress: string[] = [];
const input = (patch: Partial<Parameters<typeof uploadMomentPollOptionImages>[0]> = {}) => ({
  postId: "post1", poll, attachmentCount: 1,
  onProgress: (message: string) => progress.push(message),
  active: () => true, wait: vi.fn(async () => undefined), maxWaitAttempts: 2,
  ...patch,
});
beforeEach(() => {
  progress.length = 0; vi.clearAllMocks();
  vi.mocked(uploadMomentPhoto).mockResolvedValue("media1");
  vi.mocked(feedClient.reserveUpload).mockResolvedValue({
    postId: "post1", uploadId: "upload1", mediaId: "media1", kind: "photo",
    status: "ready", postUrl: null, postFields: null, urlExpiresAt: null,
    reservationExpiresAt: "2026-10-27T12:00:00.000Z", media: null,
    errorCode: null, errorMessage: null,
  });
});
afterEach(() => vi.restoreAllMocks());
describe("WEB4 READY-gated option photo upload into Core poll", () => {
  it("waits on authenticated ticket status and sends only server-owned READY media IDs", async () => {
    vi.mocked(feedClient.reserveUpload).mockResolvedValueOnce({
      postId: "post1", uploadId: "upload1", mediaId: "media1", kind: "photo",
      status: "processing", postUrl: null, postFields: null, urlExpiresAt: null,
    reservationExpiresAt: "2026-10-27T12:00:00.000Z", media: null,
    errorCode: null, errorMessage: null,
    });
    const params = input();
    const saved = await uploadMomentPollOptionImages(params);
    expect(saved.options).toEqual([
      {text: "Собака", imageMediaId: "media1"}, {text: "Кошка"},
    ]);
    expect(JSON.stringify(saved)).not.toContain("blob:private-preview");
    expect(uploadMomentPhoto).toHaveBeenCalledWith(expect.objectContaining({
      postId: "post1", file, clientRequestId: reqId, existingCount: 1,
    }));
    expect(validateMomentPhoto).toHaveBeenCalledWith(file, 1);
    expect(feedClient.reserveUpload).toHaveBeenCalledTimes(2);
    expect(params.wait).toHaveBeenCalledWith(5_000);
    expect(progress.some(v => v.includes("Обрабатываем"))).toBe(true);
  });
  it("rejects a foreign, mismatched media ACK before any poll PUT", async () => {
    vi.mocked(feedClient.reserveUpload).mockResolvedValue({
      postId: "other", uploadId: "upload1", mediaId: "foreign", kind: "photo",
      status: "ready", postUrl: null, postFields: null, urlExpiresAt: null,
    reservationExpiresAt: "2026-10-27T12:00:00.000Z", media: null,
    errorCode: null, errorMessage: null,
    });
    await expect(uploadMomentPollOptionImages(input()))
      .rejects.toThrow("Не совпадает резервирование");
  });
  it("refuses to serialize option media before Core processing READY", async () => {
    vi.mocked(feedClient.reserveUpload).mockResolvedValue({
      postId: "post1", uploadId: "upload1", mediaId: "media1", kind: "photo",
      status: "processing", postUrl: null, postFields: null, urlExpiresAt: null,
    reservationExpiresAt: "2026-10-27T12:00:00.000Z", media: null,
    errorCode: null, errorMessage: null,
    });
    await expect(uploadMomentPollOptionImages(input()))
      .rejects.toThrow("не завершена");
    expect(feedClient.reserveUpload).toHaveBeenCalledTimes(2);
  });
  it("fails closed on 10-attachment budget or supplied foreign media ID", async () => {
    await expect(uploadMomentPollOptionImages(input({attachmentCount: 10})))
      .rejects.toThrow("Слишком много");
    await expect(uploadMomentPollOptionImages(input({
      poll: {...poll, options: [{...poll.options[0], imageMediaId: "fake"}, poll.options[1]]},
    }))).rejects.toThrow("Недопустимый набор");
    expect(uploadMomentPhoto).not.toHaveBeenCalled();
  });
  it("does not write or poll after the actor/editor is retired", async () => {
    await expect(uploadMomentPollOptionImages(input({active: () => false})))
      .rejects.toThrow("Редактор закрыт");
    expect(uploadMomentPhoto).not.toHaveBeenCalled();
  });

  it("sends five poll option images in parallel and commits IDs in original option order", async () => {
    const finish = new Map<number, (id: string) => void>();
    let active = 0, peak = 0;
    vi.mocked(uploadMomentPhoto).mockImplementation(({ existingCount }) => {
      active++;
      peak = Math.max(peak, active);
      return new Promise<string>(resolve => {
        finish.set(existingCount, value => { active--; resolve(value); });
      });
    });
    vi.mocked(feedClient.reserveUpload).mockImplementation(async (_postId, request) => {
      const index = Number(request.clientRequestId.replace("poll-", ""));
      return { postId: "post1", uploadId: `upload-${index}`,
        mediaId: `photo-media-${index}`, kind: "photo", status: "ready",
        postUrl: null, postFields: null, urlExpiresAt: null,
        reservationExpiresAt: "2026-10-27T12:00:00.000Z", media: null,
        errorCode: null, errorMessage: null };
    });
    const many: MomentInlinePollDraft = {
      ...poll, options: Array.from({ length: 5 }, (_, index) => ({
        text: `Answer ${index}`, imageAsset: {
          file: new File([`${index}`], `image-${index}.webp`, { type: "image/webp" }),
          requestId: `poll-${index}`, bytes: 1, previewUri: `blob:${index}`,
        },
      })),
    };
    const operation = uploadMomentPollOptionImages(input({ poll: many, attachmentCount: 0 }));
    await vi.waitFor(() => expect(uploadMomentPhoto).toHaveBeenCalledTimes(5));
    expect(peak).toBe(5);
    for (const index of [4, 2, 0, 3, 1]) finish.get(index)!(`photo-media-${index}`);
    const result = await operation;
    expect(result.options).toEqual(Array.from({ length: 5 }, (_, index) => ({
      text: `Answer ${index}`, imageMediaId: `photo-media-${index}`,
    })));
    expect(JSON.stringify(result)).not.toContain("blob:");
    expect(active).toBe(0);
    expect(feedClient.reserveUpload).toHaveBeenCalledTimes(5);
  });
});
