import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  transaction: vi.fn(),
  preflightPet: vi.fn(),
  readCommitted: vi.fn(),
  upload: vi.fn(),
  deleted: vi.fn(),
  makePath: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: fixture.transaction,
    pet: { findFirst: fixture.preflightPet },
    petDocument: { findFirst: fixture.readCommitted },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  uploadFileToCDN: fixture.upload,
  deleteFileFromCDN: fixture.deleted,
  getPetDocumentPath: fixture.makePath,
  getRelativePathFromCDNUrl: (url: string) => url,
  parsePrivateMediaLocation: (url: string) =>
    url.startsWith("cloudru:") ? { kind: "documents", key: "documents/uploads/u" } : null,
  signPrivateUserMedia: fixture.signed,
  privateMediaEnabled: () => true,
  privateMediaLocation: () => "cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf",
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("./petVetVisitService", () => ({ enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn() }));
import { uploadPetDocument } from "./petsService";
const location = "cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf";
const uploaded = new File(["%PDF-1.4"], "misleading.txt", { type: "application/pdf" });
let commitFails = false;
let tx: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  commitFails = false;
  fixture.preflightPet.mockResolvedValue({ id: "p" });
  fixture.upload.mockResolvedValue(location);
  fixture.signed.mockResolvedValue("https://s3.cloud.ru/short-lived-signed");
  fixture.makePath.mockReturnValue("users/u/pets/p/documents/id.pdf");
  fixture.deleted.mockResolvedValue(undefined);
  fixture.readCommitted.mockResolvedValue(null);
  tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "u" }]),
    pet: { findFirst: vi.fn().mockResolvedValue({ id: "p" }) },
    petDocument: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: "id",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  };
  fixture.transaction.mockImplementation(async (cb: (tx: typeof tx) => unknown) => {
    const result = await cb(tx);
    if (commitFails) throw new Error("COMMIT_INDETERMINATE");
    return result;
  });
});
describe("Cloud.ru pet document transaction compensation", () => {
  it("keeps the provider marker in DB and returns a fresh signed URL to the owner", async () => {
    const item = await uploadPetDocument("p", "u", uploaded);
    expect(item.url).toBe("https://s3.cloud.ru/short-lived-signed");
    expect(fixture.makePath.mock.calls[0]?.[3]).toBe("pdf");
    expect(
      (tx.petDocument as { create: ReturnType<typeof vi.fn> }).create.mock.calls[0]?.[0].data.url,
    ).toBe(location);
    expect(fixture.deleted).not.toHaveBeenCalled();
  });
  it("does not write to private S3 when the pet is absent or owned by someone else", async () => {
    fixture.preflightPet.mockResolvedValue(null);
    await expect(uploadPetDocument("p", "u", uploaded)).rejects.toThrow("Питомец не найден");
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.transaction).not.toHaveBeenCalled();
  });
  it("uploads before opening the owner-locked database transaction", async () => {
    await uploadPetDocument("p", "u", uploaded);
    const uploadOrder = fixture.upload.mock.invocationCallOrder[0];
    const transactionOrder = fixture.transaction.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(transactionOrder!);
    expect(fixture.transaction.mock.calls[0][1]).toEqual({ timeout: 10000 });
  });
  it("tries deleting exact UUID on ambiguous S3 PUT timeout", async () => {
    fixture.upload.mockRejectedValue(new Error("UPLOAD_TIMEOUT"));
    await expect(uploadPetDocument("p", "u", uploaded)).rejects.toThrow("UPLOAD_TIMEOUT");
    expect(fixture.deleted).toHaveBeenCalledWith(location);
    expect(fixture.transaction).not.toHaveBeenCalled();
  });
  it("cleans the exact Cloud object only after an unsuccessful COMMIT and no saved record", async () => {
    commitFails = true;
    await expect(uploadPetDocument("p", "u", uploaded)).rejects.toThrow("COMMIT_INDETERMINATE");
    expect(fixture.readCommitted).toHaveBeenCalledWith({
      where: { url: location, petId: "p", ownerId: "u" },
      select: { id: true },
    });
    expect(fixture.deleted).toHaveBeenCalledWith(location);
  });
  it("never deletes the object when the COMMIT actually succeeded before a lost response", async () => {
    commitFails = true;
    fixture.readCommitted.mockResolvedValue({ id: "id" });
    await expect(uploadPetDocument("p", "u", uploaded)).rejects.toThrow("COMMIT_INDETERMINATE");
    expect(fixture.deleted).not.toHaveBeenCalled();
  });
  it("fails closed when DB cannot confirm whether a committed document exists", async () => {
    commitFails = true;
    fixture.readCommitted.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    await expect(uploadPetDocument("p", "u", uploaded)).rejects.toThrow("COMMIT_INDETERMINATE");
    expect(fixture.deleted).not.toHaveBeenCalled();
  });
});
