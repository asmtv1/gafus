/** G1 actual Core veterinarian visit authorization, mocked Prisma/media URL. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  petFind: vi.fn(), visitFind: vi.fn(), attachmentFind: vi.fn(), mediaUrl: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { findFirst: mock.petFind },
    petVetVisit: { findMany: mock.visitFind },
    petVetAttachment: { findFirst: mock.attachmentFind },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  vetVisitMediaUrl: mock.mediaUrl,
  uploadVetVisitFile: vi.fn(), vetVisitFileKeys: vi.fn(),
}));
vi.mock("../gallery/persistence", () => ({ enqueueDelete: vi.fn() }));
import { getPetVetMedia, listPetVetVisits } from "./petVetVisitService";

beforeEach(() => {
  vi.clearAllMocks();
  mock.petFind.mockResolvedValue({ id: "pet-A" });
  mock.visitFind.mockResolvedValue([]);
  mock.attachmentFind.mockResolvedValue({
    id: "attachment-A", name: "health.pdf",
    originalKey: "owners/actor-A/pet-A/original", previewKey: "owners/actor-A/pet-A/preview",
  });
  mock.mediaUrl.mockResolvedValue("https://signed.invalid/secret");
});

describe("G1 Core actual vet visit owner conditions", () => {
  it("rejects listing a foreign pet before vet visit query", async () => {
    mock.petFind.mockResolvedValueOnce(null);
    await expect(listPetVetVisits("pet-A", "actor-B"))
      .rejects.toMatchObject({ status: 404 });
    expect(mock.petFind).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "actor-B" }, select: { id: true },
    });
    expect(mock.visitFind).not.toHaveBeenCalled();
  });
  it("lists only current owner's visits, ordered newest first", async () => {
    await expect(listPetVetVisits("pet-A", "actor-A")).resolves.toEqual([]);
    expect(mock.visitFind).toHaveBeenCalledWith({
      where: { petId: "pet-A", ownerId: "actor-A" },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ visitedOn: "desc" }, { createdAt: "desc" }],
    });
  });
  it("rejects foreign attachment before signing media URL", async () => {
    mock.attachmentFind.mockResolvedValueOnce(null);
    await expect(getPetVetMedia("pet-A", "actor-B", "visit-A", "file-A", "preview"))
      .rejects.toMatchObject({ status: 404 });
    expect(mock.attachmentFind).toHaveBeenCalledWith({
      where: { id: "file-A", visitId: "visit-A", visit: { petId: "pet-A", ownerId: "actor-B" } },
    });
    expect(mock.mediaUrl).not.toHaveBeenCalled();
  });
  it("authorized preview returns signed URL only after owner-scoped lookup", async () => {
    const data = await getPetVetMedia("pet-A", "actor-A", "visit-A", "file-A", "preview");
    expect(data).toEqual({ url: "https://signed.invalid/secret" });
    expect(mock.attachmentFind).toHaveBeenCalledWith({
      where: { id: "file-A", visitId: "visit-A", visit: { petId: "pet-A", ownerId: "actor-A" } },
    });
    expect(mock.mediaUrl).toHaveBeenCalledWith("owners/actor-A/pet-A/preview", undefined);
  });
  it("download uses original key and attachment filename only after owner lookup", async () => {
    await getPetVetMedia("pet-A", "actor-A", "visit-A", "file-A", "download");
    expect(mock.mediaUrl).toHaveBeenCalledWith("owners/actor-A/pet-A/original", "health.pdf");
  });
  it("unknown variant rejects before signing media", async () => {
    await expect(getPetVetMedia("pet-A", "actor-A", "visit-A", "file-A", "other"))
      .rejects.toMatchObject({ status: 400 });
    expect(mock.mediaUrl).not.toHaveBeenCalled();
  });
  it("missing preview fails closed rather than signing original key", async () => {
    mock.attachmentFind.mockResolvedValueOnce({ originalKey: "private-original", previewKey: null });
    await expect(getPetVetMedia("pet-A", "actor-A", "visit-A", "file-A", "preview"))
      .rejects.toMatchObject({ status: 404 });
    expect(mock.mediaUrl).not.toHaveBeenCalled();
  });
});
