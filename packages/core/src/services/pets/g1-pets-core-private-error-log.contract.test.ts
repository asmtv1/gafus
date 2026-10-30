/** Pet Core: raw S3 failure and owner identifiers must not reach application logs. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  petList: vi.fn(), documentFind: vi.fn(), documentDelete: vi.fn(),
  cdnDelete: vi.fn(), logError: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { findMany: m.petList },
    petDocument: { findFirst: m.documentFind, delete: m.documentDelete },
  },
}));
vi.mock("@gafus/cdn-upload", () => ({
  getRelativePathFromCDNUrl: (s: string) => s,
  deleteFileFromCDN: m.cdnDelete,
  parsePrivateMediaLocation: (s: string) => s.startsWith("cloudru:") ? { key: s } : null,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logError, info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("./petVetVisitService", () => ({
  enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn(),
}));
import { deletePetDocument, getUserPets } from "./petsService";

const SECRET = "SYNTHETIC_STORAGE_PROVIDER_PRIVATE_KEY_DO_NOT_LOG";
const OWNER = "SYNTHETIC_PRIVATE_OWNER_ID";
const PET = "SYNTHETIC_PRIVATE_PET_ID";
const DOC = "doc-synthetic";
function assertPrivate() {
  expect(m.logError).toHaveBeenCalledTimes(1);
  const text = m.logError.mock.calls.flat().map(x => x instanceof Error
    ? [x.message, x.stack, String(x.cause)].join(" ")
    : JSON.stringify(x)).join(" ");
  for (const secret of [SECRET, OWNER, PET]) expect(text).not.toContain(secret);
}
beforeEach(() => {
  vi.resetAllMocks();
  m.documentFind.mockResolvedValue({
    id: DOC, ownerId: OWNER, petId: PET,
    url: "cloudru:documents/fixture.pdf",
  });
  m.documentDelete.mockResolvedValue({});
});
describe("AG1 pet Core privacy with synthetic CDN and Prisma (no I/O)", () => {
  it("GET strict Core failure keeps throwOnError behavior but omits private error from logs", async () => {
    m.petList.mockRejectedValueOnce(new Error(SECRET));
    await expect(getUserPets(OWNER, { throwOnError: true })).rejects.toThrow(SECRET);
    assertPrivate();
  });
  it("failed private CDN delete keeps database locator and throws, logging no owner or provider secret", async () => {
    m.cdnDelete.mockRejectedValueOnce(new Error(SECRET));
    await expect(deletePetDocument(DOC, OWNER, PET)).rejects.toThrow(SECRET);
    expect(m.documentFind).toHaveBeenCalledWith({
      where: { id: DOC, ownerId: OWNER, petId: PET },
    });
    expect(m.documentDelete).not.toHaveBeenCalled();
    assertPrivate();
  });
  it("failed legacy CDN deletion remains best-effort: delete database locator", async () => {
    m.documentFind.mockResolvedValueOnce({ id: DOC, url: "https://legacy.invalid/document.pdf" });
    m.cdnDelete.mockRejectedValueOnce(new Error(SECRET));
    const result = await deletePetDocument(DOC, OWNER, PET);
    expect(result).toBe(true);
    expect(m.documentDelete).toHaveBeenCalledWith({ where: { id: DOC } });
    assertPrivate();
  });
});
