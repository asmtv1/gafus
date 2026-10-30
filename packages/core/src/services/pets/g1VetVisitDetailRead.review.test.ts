/** AG1 typed owner-scoped detail GET, mocked Prisma only, never real PHI. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pet: vi.fn(), visit: vi.fn(), jobs: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: {
  pet: { findFirst: m.pet },
  petVetVisit: { findFirst: m.visit },
  galleryStorageJob: { findMany: m.jobs },
} }));
import { getOwnVetVisitDetail } from "./g1VetVisitDetailRead.review";
const visit = {
  id: "visit-A", petId: "pet-A", visitedOn: new Date("2026-10-01T00:00:00Z"),
  specialty: "synthetic", doctorName: "", clinic: "", diagnosis: "PHI_SYNTHETIC",
  conclusion: "", notes: "", attachments: [
    { id: "att-1", name: "x.png", mimeType: "image/png", sizeBytes: 4,
      previewKey: null, originalKey: "SECRET_S3_OBJECT", createdAt: new Date() },
  ],
};
beforeEach(() => {
  vi.clearAllMocks(); m.pet.mockResolvedValue({ id: "pet-A" });
  m.visit.mockResolvedValue(visit); m.jobs.mockResolvedValue([{ dedupeKey: "vet-preview:att-1" }]);
});
describe("AG1 single vet visit owner-specific SELECT and DTO", () => {
  it("V01 owner check and visit SELECT both scoped by pet and JWT actor", async () => {
    const dto = await getOwnVetVisitDetail("owner-A", "pet-A", "visit-A");
    expect(m.pet).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "owner-A" }, select: { id: true },
    });
    expect(m.visit).toHaveBeenCalledWith({
      where: { id: "visit-A", petId: "pet-A", ownerId: "owner-A" },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
    });
    expect(dto).toMatchObject({ id: "visit-A", petId: "pet-A", visitedOn: "2026-10-01" });
    expect(JSON.stringify(dto)).not.toContain("SECRET_S3_OBJECT");
    expect(JSON.stringify(dto)).not.toContain("originalKey");
    expect(dto.attachments[0]).toMatchObject({ hasPreview: false, previewProcessing: true });
  });
  it("V02 different owner cannot pass pet access, before visit read", async () => {
    m.pet.mockResolvedValue(null);
    await expect(getOwnVetVisitDetail("owner-B", "pet-A", "visit-A"))
      .rejects.toMatchObject({ status: 404 });
    expect(m.visit).not.toHaveBeenCalled();
  });
  it("V03 owned pet with foreign/absent visit returns identical 404, no PII", async () => {
    m.visit.mockResolvedValueOnce(null);
    await expect(getOwnVetVisitDetail("owner-A", "pet-A", "foreign"))
      .rejects.toMatchObject({ status: 404 });
    expect(m.jobs).not.toHaveBeenCalled();
  });
  it("V04 empty attachments retain typed empty list and no job lookups", async () => {
    m.visit.mockResolvedValueOnce({ ...visit, attachments: [] });
    const dto = await getOwnVetVisitDetail("owner-A", "pet-A", "visit-A");
    expect(dto.attachments).toEqual([]);
    expect(m.jobs).not.toHaveBeenCalled();
  });
  it("V06 invalid pet or visit ID returns masked 404 before any Prisma read", async () => {
    for (const [petId, visitId] of [
      ["../secret", "visit-A"], ["pet-A", "bad%2Fid"], ["pet-A", "x".repeat(129)],
    ]) {
      await expect(getOwnVetVisitDetail("owner-A", petId, visitId))
        .rejects.toMatchObject({ status: 404, code: "VET_VISIT_NOT_FOUND" });
    }
    expect(m.pet).not.toHaveBeenCalled();
    expect(m.visit).not.toHaveBeenCalled();
  });
  it("V05 missing preview with no active job is not flagged processing", async () => {
    m.jobs.mockResolvedValueOnce([]);
    const dto = await getOwnVetVisitDetail("owner-A", "pet-A", "visit-A");
    expect(dto.attachments[0]?.previewProcessing).toBe(false);
  });
});
