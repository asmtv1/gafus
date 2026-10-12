import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: vi.fn(),
  visits: vi.fn(),
  active: vi.fn(),
  write: vi.fn(),
  queue: vi.fn(),
  reserve: vi.fn(),
  create: vi.fn(),
  sniff: vi.fn(),
}));
vi.mock("file-type", () => ({ fileTypeFromBuffer: m.sniff }));
vi.mock("@gafus/cdn-upload", () => ({
  uploadVetVisitFile: m.write,
  vetVisitFileKeys: (_u: string, _p: string, _v: string, id: string, mime: string) => ({
    originalKey: `users/u/pets/p/vet-visits/v/${id}/original.${mime === "application/pdf" ? "pdf" : "jpg"}`,
    previewKey: mime === "application/pdf" ? null : `users/u/pets/p/vet-visits/v/${id}/thumb.webp`,
  }),
}));
vi.mock("../gallery/persistence", () => ({ enqueueDelete: m.reserve }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    petVetVisit: { findFirst: vi.fn().mockResolvedValue({ id: "v" }), findMany: m.visits },
    pet: { findFirst: m.owner },
    galleryStorageJob: { findMany: m.active },
    $transaction: (fn: (db: object) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "u" }]),
        petVetAttachment: { count: vi.fn().mockResolvedValue(0), create: m.create },
        galleryStorageJob: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: m.queue },
      }),
  },
}));
import { addPetVetAttachment, listPetVetVisits } from "./petVetVisitService";
const photo = () => new File([new Uint8Array([255, 216, 255, 217])], "dog.jpg");
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VET_PREVIEW_ASYNC_ENABLED;
  m.sniff.mockResolvedValue({ mime: "image/jpeg", ext: "jpg" });
  m.write.mockResolvedValue({});
  m.create.mockResolvedValue({});
  m.queue.mockResolvedValue({});
  m.reserve.mockResolvedValue({});
  m.owner.mockResolvedValue({ id: "p" });
  m.active.mockResolvedValue([{ dedupeKey: "vet-preview:a" }]);
  m.visits.mockResolvedValue([
    {
      id: "v",
      petId: "p",
      visitedOn: new Date("2026-10-12"),
      specialty: "Врач",
      doctorName: "",
      clinic: "",
      diagnosis: "",
      conclusion: "",
      notes: "",
      attachments: [
        { id: "a", previewKey: null, mimeType: "image/jpeg", name: "Фото", sizeBytes: 4 },
      ],
    },
  ]);
});
describe("vet preview owner DTO", () => {
  it("exposes an active queue state without leaking private storage keys", async () => {
    const [visit] = await listPetVetVisits("p", "u");
    expect(visit?.attachments[0]).toMatchObject({ hasPreview: false, previewProcessing: true });
    expect(visit?.attachments[0]).not.toHaveProperty("originalKey");
    expect(m.active).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["pending", "processing"] } }),
      }),
    );
  });
  it("does not report a failed or finished queue as processing", async () => {
    m.active.mockResolvedValue([]);
    const [visit] = await listPetVetVisits("p", "u");
    expect(visit?.attachments[0]?.previewProcessing).toBe(false);
  });
});
describe("vet image processing mode", () => {
  it("creates a durable preview job only after saving an image", async () => {
    process.env.VET_PREVIEW_ASYNC_ENABLED = "true";
    await addPetVetAttachment("p", "u", "v", photo());
    expect(m.write.mock.calls[0]![3]).toEqual({ asyncPreview: true });
    expect(m.create.mock.calls[0]![0].data.previewKey).toBeNull();
    expect(m.queue.mock.calls[0]![0].data).toMatchObject({
      kind: "vetPreview",
      sourceKeys: [expect.stringMatching(/original.jpg$/)],
      targetKeys: [expect.stringMatching(/thumb.webp$/)],
      sourceETags: [expect.stringMatching(/^"[a-f0-9]{32}"$/)],
    });
    expect(m.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      m.write.mock.invocationCallOrder[0]!,
    );
    expect(m.write.mock.invocationCallOrder[0]).toBeLessThan(m.queue.mock.invocationCallOrder[0]!);
  });
  it("keeps the old synchronous thumbnail by default", async () => {
    await addPetVetAttachment("p", "u", "v", photo());
    expect(m.write.mock.calls[0]![3]).toEqual({ asyncPreview: false });
    expect(m.create.mock.calls[0]![0].data.previewKey).toMatch(/thumb.webp$/);
    expect(m.queue).not.toHaveBeenCalled();
  });
  it("never creates a PDF thumbnail job", async () => {
    process.env.VET_PREVIEW_ASYNC_ENABLED = "true";
    m.sniff.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });
    await addPetVetAttachment("p", "u", "v", new File(["%PDF-1.4"], "vet.pdf"));
    expect(m.queue).not.toHaveBeenCalled();
    expect(m.create.mock.calls[0]![0].data.previewKey).toBeNull();
  });
});
