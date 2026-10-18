import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn(),
  reserve: vi.fn(),
  commit: vi.fn(),
  findUnbound: vi.fn(),
  deleteRow: vi.fn(),
  lock: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ ext: "jpg", mime: "image/jpeg" }),
}));
vi.mock("@gafus/cdn-upload", () => ({
  uploadBufferToCDN: mocked.upload,
  deleteFileFromCDN: mocked.remove,
  privateMediaEnabled: () => true,
  publicQuestionsEnabled: () => false,
  questionCloudJobEnabled: () => false,
  parsePublicQuestionLocation: () => null,
  parsePendingQuestionLocation: () => null,
  privateMediaLocation: () => "cloudru:questions:questions/uploads/questions/u/photo.jpg",
  parsePrivateMediaLocation: (v: string) =>
    v.startsWith("cloudru:")
      ? { kind: "questions", key: "questions/uploads/questions/u/photo.jpg" }
      : null,
  signPrivateUserMedia: mocked.sign,
}));
vi.mock("./service", () => ({ questionActor: vi.fn().mockResolvedValue({ id: "u" }) }));
vi.mock("@gafus/queues", () => ({ enqueueQuestionsProcessing: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => {
      const n = ++sequence;
      if (n === 1) return mocked.reserve();
      if (n === 2) return mocked.commit();
      if (n === 3) return mocked.cleanup(cb);
      throw new Error("UNEXPECTED_TX");
    }),
  },
}));
import { uploadQuestionPhoto } from "./photos";
let sequence = 0;
const source = new Uint8Array([255, 216, 255, 217]);
const dbRow = {
  id: "photo-id",
  url: "cloudru:questions:questions/uploads/questions/u/photo.jpg",
  storagePath: "cloudru:questions:questions/uploads/questions/u/photo.jpg",
};
beforeEach(() => {
  vi.clearAllMocks();
  sequence = 0;
  mocked.reserve.mockResolvedValue({ id: "photo-id", url: "" });
  mocked.commit.mockResolvedValue({ id: "photo-id", url: dbRow.url });
  mocked.upload.mockResolvedValue(dbRow.url);
  mocked.sign.mockRejectedValue(new Error("SIGNING_FAILED"));
  mocked.remove.mockResolvedValue(undefined);
  mocked.cleanup.mockImplementation(async (cb) =>
    cb({
      $queryRaw: mocked.lock.mockResolvedValue([{ id: "u" }]),
      questionPhoto: { findFirst: mocked.findUnbound, delete: mocked.deleteRow },
    }),
  );
  mocked.findUnbound.mockResolvedValue(null);
});
describe("question Cloud.ru upload compensation", () => {
  it("never deletes a photo attached while the private URL was being signed", async () => {
    await expect(uploadQuestionPhoto("u", source)).rejects.toThrow("SIGNING_FAILED");
    expect(mocked.findUnbound).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "photo-id",
          ownerId: "u",
          questionId: null,
          answerId: null,
        }),
      }),
    );
    expect(mocked.remove).not.toHaveBeenCalled();
    expect(mocked.deleteRow).not.toHaveBeenCalled();
  });
  it("deletes only a still-unbound photo after acquiring the owner lock", async () => {
    mocked.findUnbound.mockResolvedValue(dbRow);
    await expect(uploadQuestionPhoto("u", source)).rejects.toThrow("SIGNING_FAILED");
    expect(mocked.lock).toHaveBeenCalledOnce();
    expect(mocked.remove).toHaveBeenCalledWith(dbRow.url);
    expect(mocked.deleteRow).toHaveBeenCalledWith({ where: { id: "photo-id" } });
  });
  it("retains the durable reservation if provider cleanup fails", async () => {
    mocked.findUnbound.mockResolvedValue(dbRow);
    mocked.remove.mockRejectedValue(new Error("S3_TIMEOUT"));
    await expect(uploadQuestionPhoto("u", source)).rejects.toThrow("SIGNING_FAILED");
    expect(mocked.deleteRow).not.toHaveBeenCalled();
  });
  it("does not delete data if another transaction removed the reservation", async () => {
    mocked.findUnbound.mockResolvedValue(null);
    await expect(uploadQuestionPhoto("u", source)).rejects.toThrow("SIGNING_FAILED");
    expect(mocked.remove).not.toHaveBeenCalled();
  });
});
