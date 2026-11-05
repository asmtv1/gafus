import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixed = vi.hoisted(() => {
  const owner = "owner123";
  const photoId = "photo123";
  const mediaId = "00000000-0000-4000-8000-000000000123";
  const sourceKey = `questions/v2/${owner}/${mediaId}/incoming/source.webp`;
  const small = `questions/uploads/questions/v2/${owner}/${mediaId}/v1/image/s.webp`;
  const medium = `questions/uploads/questions/v2/${owner}/${mediaId}/v1/image/m.webp`;
  const task = { ownerId: owner, photoId, mediaId, sourceKey,
    sourceMime: "image/webp", sourceBytes: 1234, status: "AWAITING_UPLOAD" };
  const photo = { id: photoId, ownerId: owner, url: "" };
  const tx = {
    questionPhoto: { findFirst: vi.fn(), update: vi.fn() },
    questionV2MediaTask: { updateMany: vi.fn() },
  };
  const db = {
    questionPhoto: { findFirst: vi.fn() },
    questionV2MediaTask: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx)),
  };
  const s3 = { head: vi.fn(), finish: vi.fn() };
  return { owner, photoId, mediaId, sourceKey, small, medium, task, photo, tx, db, s3 };
});
vi.mock("@gafus/prisma", () => ({ prisma: fixed.db }));
vi.mock("@gafus/core/services/questions", () => ({
  questionActor: vi.fn(async () => undefined),
  scheduleQuestionsV2Cleanup: vi.fn(),
  QuestionError: class extends Error { constructor(readonly code: string,
    message: string, readonly status: number) { super(message); } },
}));
vi.mock("@gafus/core/services/mediaDelivery", () => ({
  questionsCanRetryConfirmedPhoto: vi.fn(), questionsPhotoDailyLimitReached: vi.fn(),
}));
vi.mock("@gafus/feed-cloud", () => ({
  questionsV2CheckSource: vi.fn(), questionsV2SourceKey: vi.fn(),
  questionsV2FinalKeys: vi.fn(() => ({ small: fixed.small, medium: fixed.medium })),
  questionsV2ValidateManifest: vi.fn(),
}));
vi.mock("@gafus/cdn-upload", () => ({
  questionsV2PresignedPost: vi.fn(), questionsV2Head: fixed.s3.head,
  questionsV2Delivery: vi.fn(), questionsV2Marker: (key: string) => `questions-v2:${key}`,
  questionsV2ClientSmallPost: vi.fn(), questionsV2FinishClientWebp: fixed.s3.finish,
}));
vi.mock("@gafus/queues", () => ({ enqueueQuestionsPhoto: vi.fn() }));
import { confirmClientQuestionsPhoto } from "./media-v2-upload.js";

beforeEach(() => {
  vi.stubEnv("GAFUS_CLIENT_PHOTO_READY", "true");
  vi.stubEnv("QUESTIONS_V2_MEDIA_ENABLED", "true");
  fixed.db.questionPhoto.findFirst.mockResolvedValue(fixed.photo);
  fixed.db.questionV2MediaTask.findUnique.mockResolvedValue(fixed.task);
  fixed.db.questionV2MediaTask.updateMany.mockResolvedValue({ count: 1 });
  fixed.tx.questionPhoto.findFirst.mockResolvedValue(fixed.photo);
  fixed.tx.questionPhoto.update.mockResolvedValue(fixed.photo);
  fixed.tx.questionV2MediaTask.updateMany.mockResolvedValue({ count: 1 });
  fixed.s3.head.mockResolvedValue({ bytes: fixed.task.sourceBytes, mime: "image/webp" });
  fixed.s3.finish.mockResolvedValue({ kind: "image", variants: {
    small: { key: fixed.small, width: 360, height: 270, bytes: 500 },
    medium: { key: fixed.medium, width: 720, height: 540, bytes: 1234 },
  } });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("client Questions READY commit", () => {
  it("commits READY and published medium URL together in a single DB transaction", async () => {
    await expect(confirmClientQuestionsPhoto(fixed.owner, fixed.photoId))
      .resolves.toEqual({ id: fixed.photoId, status: "READY" });
    expect(fixed.db.$transaction).toHaveBeenCalledOnce();
    expect(fixed.tx.questionV2MediaTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "CLIENT_PROCESSING" }),
      data: expect.objectContaining({ status: "READY", cleanupKind: "SOURCE" }),
    }));
    expect(fixed.tx.questionPhoto.update).toHaveBeenCalledWith({
      where: { id: fixed.photoId }, data: { url: `questions-v2:${fixed.medium}` },
    });
  });

  it("never writes public URL when READY CAS loses the lease", async () => {
    fixed.tx.questionV2MediaTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(confirmClientQuestionsPhoto(fixed.owner, fixed.photoId))
      .rejects.toThrow("Готовые варианты фото не прошли проверку");
    expect(fixed.tx.questionPhoto.update).not.toHaveBeenCalled();
    expect(fixed.db.questionV2MediaTask.updateMany).toHaveBeenCalledTimes(2);
  });

  it("requires the owner photo row to exist before committing READY", async () => {
    fixed.tx.questionPhoto.findFirst.mockResolvedValue(null);
    await expect(confirmClientQuestionsPhoto(fixed.owner, fixed.photoId))
      .rejects.toThrow("Готовые варианты фото не прошли проверку");
    expect(fixed.tx.questionV2MediaTask.updateMany).not.toHaveBeenCalled();
    expect(fixed.tx.questionPhoto.update).not.toHaveBeenCalled();
  });
});
