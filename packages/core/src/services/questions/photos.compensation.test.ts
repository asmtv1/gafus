import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  uploadSource: vi.fn(), remove: vi.fn(), count: vi.fn(), create: vi.fn(),
  update: vi.fn(), findUnbound: vi.fn(), deleteRow: vi.fn(), lock: vi.fn(),
  purge: vi.fn(), transaction: vi.fn(),
}));
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ ext: "jpg", mime: "image/jpeg" }),
}));
vi.mock("@gafus/cdn-upload", () => ({
  questionCloudJobEnabled: () => true,
  pendingQuestionLocation: (path: string) => "cloudru:questions-pending:" + path,
  uploadQuestionSource: m.uploadSource,
  deleteFileFromCDN: m.remove,
  parsePublicQuestionLocation: () => null,
  parsePendingQuestionLocation: (location: string) => location.startsWith("cloudru:questions-pending:")
    ? location.slice("cloudru:questions-pending:".length) : null,
  questionImageVariantKeys: () => ({thumb:"questions/uploads/questions/u/id/thumb.webp",full:"questions/uploads/questions/u/id/full.webp"}),
}));
vi.mock("@gafus/queues", () => ({ enqueueQuestionsProcessing: vi.fn() }));
vi.mock("./service", () => ({ questionActor: vi.fn().mockResolvedValue({ id: "u" }) }));
vi.mock("../mediaDelivery/purgeQueue", () => ({ enqueueDeletedMediaPurge: m.purge }));
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { uploadQuestionPhoto } from "./photos";
const bytes = new Uint8Array([255, 216, 255, 217]);
const row = { id: "photo-id", storagePath: "cloudru:questions-pending:questions/incoming/questions/u/id/source.jpg", url: "" };
beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(0);
  m.create.mockResolvedValue(row);
  m.findUnbound.mockResolvedValue(row);
  m.uploadSource.mockRejectedValue(new Error("SOURCE_UPLOAD_FAILED"));
  m.remove.mockResolvedValue(undefined);
  m.purge.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async cb => cb({
    $queryRaw: m.lock,
    questionPhoto: {
      count: m.count, create: m.create, update: m.update,
      findFirst: m.findUnbound, delete: m.deleteRow,
    },
  }));
});
describe("question public processing compensation", () => {
  it("never deletes a pending photo attached by another request", async () => {
    m.findUnbound.mockResolvedValue(null);
    await expect(uploadQuestionPhoto("u", bytes)).rejects.toThrow("SOURCE_UPLOAD_FAILED");
    expect(m.lock).toHaveBeenCalledOnce();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.deleteRow).not.toHaveBeenCalled();
  });
  it("cleans up only an unbound pending source under the owner lock", async () => {
    await expect(uploadQuestionPhoto("u", bytes)).rejects.toThrow("SOURCE_UPLOAD_FAILED");
    expect(m.findUnbound).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: row.id, ownerId: "u", questionId: null, answerId: null }),
    }));
    expect(m.remove).toHaveBeenCalledWith(row.storagePath);
    expect(m.purge).toHaveBeenCalledOnce();
    expect(m.deleteRow).toHaveBeenCalledWith({ where: { id: row.id } });
  });
  it("keeps the reservation for a later retry if storage cleanup fails", async () => {
    m.remove.mockRejectedValue(new Error("S3_TIMEOUT"));
    await expect(uploadQuestionPhoto("u", bytes)).rejects.toThrow("SOURCE_UPLOAD_FAILED");
    expect(m.deleteRow).not.toHaveBeenCalled();
  });
});
