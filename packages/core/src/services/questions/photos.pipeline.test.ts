import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  jobEnabled: vi.fn(), uploadSource: vi.fn(), wake: vi.fn(), count: vi.fn(),
  create: vi.fn(), update: vi.fn(), transaction: vi.fn(),
}));
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ ext: "png", mime: "image/png" }),
}));
vi.mock("@gafus/cdn-upload", () => ({
  questionCloudJobEnabled: m.jobEnabled,
  pendingQuestionLocation: (path: string) => "cloudru:questions-pending:" + path,
  uploadQuestionSource: m.uploadSource,
}));
vi.mock("@gafus/queues", () => ({ enqueueQuestionsProcessing: m.wake }));
vi.mock("./service", () => ({ questionActor: vi.fn().mockResolvedValue({ id: "owner" }) }));
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { uploadQuestionPhoto } from "./photos";
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
beforeEach(() => {
  vi.clearAllMocks();
  m.jobEnabled.mockReturnValue(true);
  m.count.mockResolvedValue(0);
  m.create.mockImplementation(async ({data}) => ({ id: "photo-id", ...data }));
  m.update.mockImplementation(async ({data}) => ({ id: "photo-id", ...data }));
  m.uploadSource.mockResolvedValue("cloudru:questions-pending:questions/incoming/questions/owner/id/source.png");
  m.wake.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async cb => cb({ questionPhoto: {
    count: m.count, create: m.create, update: m.update,
  }}));
});
describe("Questions one Cloud.ru Jobs photo pipeline", () => {
  it("stores a pending source and returns only processing state, never a private S3 URL", async () => {
    const result = await uploadQuestionPhoto("owner", bytes);
    expect(result).toEqual({ id: "photo-id", url: "", processing: true });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      storagePath: expect.stringMatching(/^cloudru:questions-pending:/), url: "",
    }) });
    expect(m.uploadSource).toHaveBeenCalledWith(expect.any(String), bytes, "image/png");
    expect(m.wake).toHaveBeenCalledWith(expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ));
  });
  it("fails closed without ready Jobs rather than choosing a private upload", async () => {
    m.jobEnabled.mockReturnValue(false);
    await expect(uploadQuestionPhoto("owner", bytes)).rejects.toMatchObject({
      status: 503, code: "PHOTO_PROCESSING_UNAVAILABLE",
    });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.uploadSource).not.toHaveBeenCalled();
  });
});
