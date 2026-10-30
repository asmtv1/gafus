/** AG1 G1: real Core pet-document owner policy, mocked Prisma and private CDN.
 * No real DB, S3, credentials, files, or production connections.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  petFindFirst: vi.fn(),
  documentsFindMany: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  documentDelete: vi.fn(),
  signer: vi.fn(),
  cdnDelete: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { findFirst: m.petFindFirst },
    petDocument: {
      findMany: m.documentsFindMany,
      findFirst: m.documentFindFirst,
      update: m.documentUpdate,
      delete: m.documentDelete,
    },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  parsePrivateMediaLocation: (url: string) => url.startsWith("cloudru:") ? { key: url } : null,
  signPrivateUserMedia: m.signer,
  deleteFileFromCDN: m.cdnDelete,
  getRelativePathFromCDNUrl: (url: string) => url,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("./petVetVisitService", () => ({
  enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn(),
}));

import {
  deletePetDocument,
  getPetDocumentById,
  listPetDocuments,
  preparePetDocumentDownload,
  renamePetDocument,
} from "./petsService";

const privatePath = "cloudru:documents:owners/owner-A/pets/pet-A/document-A.pdf";
const document = {
  id: "doc-A", petId: "pet-A", ownerId: "owner-A", name: "health.pdf",
  mimeType: "application/pdf", sizeBytes: 100, url: privatePath,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
function scoped(userId: string, petId = "pet-A") {
  return { id: "doc-A", ownerId: userId, petId };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.petFindFirst.mockResolvedValue({ id: "pet-A" });
  m.documentsFindMany.mockResolvedValue([document]);
  m.documentFindFirst.mockResolvedValue(document);
  m.documentUpdate.mockResolvedValue(document);
  m.documentDelete.mockResolvedValue(document);
  m.signer.mockResolvedValue("https://signed.invalid/owner-A");
  m.cdnDelete.mockResolvedValue(undefined);
});

describe("AG1 G1 private document authorization in real Core", () => {
  it("requires owner-scoped pet existence before listing documents", async () => {
    m.petFindFirst.mockResolvedValueOnce(null);
    await expect(listPetDocuments("pet-A", "user-B")).rejects.toThrow("Питомец не найден");
    expect(m.petFindFirst).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "user-B" }, select: { id: true },
    });
    expect(m.documentsFindMany).not.toHaveBeenCalled();
    expect(m.signer).not.toHaveBeenCalled();
  });

  it("lists only scoped documents, signing private URL after owner lookup", async () => {
    const data = await listPetDocuments("pet-A", "owner-A");
    expect(m.documentsFindMany).toHaveBeenCalledWith({
      where: { petId: "pet-A", ownerId: "owner-A" },
      orderBy: [{ createdAt: "desc" }],
    });
    expect(data[0]?.url).toBe("https://signed.invalid/owner-A");
    expect(m.signer).toHaveBeenCalledWith(privatePath);
  });

  it("does not sign a foreign document for a direct lookup", async () => {
    m.documentFindFirst.mockResolvedValueOnce(null);
    expect(await getPetDocumentById("doc-A", "user-B", "pet-A")).toBeNull();
    expect(m.documentFindFirst).toHaveBeenCalledWith({ where: scoped("user-B") });
    expect(m.signer).not.toHaveBeenCalled();
  });

  it("cannot return a private download URL for a foreign document", async () => {
    m.documentFindFirst.mockResolvedValueOnce(null);
    const payload = await preparePetDocumentDownload("doc-A", "user-B", "pet-A");
    expect(payload).toBeNull();
    expect(m.documentFindFirst).toHaveBeenCalledWith({
      where: scoped("user-B"),
      select: { id: true, name: true, mimeType: true, sizeBytes: true, url: true },
    });
    expect(m.signer).not.toHaveBeenCalled();
  });

  it("signs authorized download for 120 seconds without exposing storage marker", async () => {
    const payload = await preparePetDocumentDownload("doc-A", "owner-A", "pet-A");
    expect(payload).toEqual({
      documentId: "doc-A", fileName: "health.pdf", mimeType: "application/pdf",
      sizeBytes: 100, downloadUrl: "https://signed.invalid/owner-A",
    });
    expect(m.signer).toHaveBeenCalledWith(privatePath, 120, "health.pdf");
  });

  it("foreign rename cannot update metadata or create a signed URL", async () => {
    m.documentFindFirst.mockResolvedValueOnce(null);
    const result = await renamePetDocument("doc-A", "user-B", "my document", "pet-A");
    expect(result).toBeNull();
    expect(m.documentFindFirst).toHaveBeenCalledWith({ where: scoped("user-B") });
    expect(m.documentUpdate).not.toHaveBeenCalled();
    expect(m.signer).not.toHaveBeenCalled();
  });

  it("authorized rename preserves original extension and owner-scoped lookup", async () => {
    const renamed = await renamePetDocument("doc-A", "owner-A", "medical 2026", "pet-A");
    expect(renamed).not.toBeNull();
    expect(m.documentFindFirst).toHaveBeenCalledWith({ where: scoped("owner-A") });
    expect(m.documentUpdate).toHaveBeenCalledWith({
      where: { id: "doc-A" }, data: { name: "medical 2026.pdf" },
    });
  });

  it("foreign delete cannot remove CDN object or database locator", async () => {
    m.documentFindFirst.mockResolvedValueOnce(null);
    const result = await deletePetDocument("doc-A", "user-B", "pet-A");
    expect(result).toBe(false);
    expect(m.documentFindFirst).toHaveBeenCalledWith({ where: scoped("user-B") });
    expect(m.cdnDelete).not.toHaveBeenCalled();
    expect(m.documentDelete).not.toHaveBeenCalled();
  });

  it("refuses to remove private locator when private CDN deletion fails", async () => {
    m.cdnDelete.mockRejectedValueOnce(new Error("TEST_CDN_TIMEOUT"));
    await expect(deletePetDocument("doc-A", "owner-A", "pet-A"))
      .rejects.toThrow("TEST_CDN_TIMEOUT");
    expect(m.documentDelete).not.toHaveBeenCalled();
  });

  it("authorized delete removes owner-scoped document only after CDN delete succeeds", async () => {
    const result = await deletePetDocument("doc-A", "owner-A", "pet-A");
    expect(result).toBe(true);
    expect(m.cdnDelete).toHaveBeenCalledWith(privatePath);
    expect(m.documentDelete).toHaveBeenCalledWith({ where: { id: "doc-A" } });
    expect(m.cdnDelete.mock.invocationCallOrder[0])
      .toBeLessThan(m.documentDelete.mock.invocationCallOrder[0]!);
  });
});
