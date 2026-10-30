/** Existing Core history GET: all data synthetic, no PostgreSQL/provider call. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: vi.fn(), visits: vi.fn(), jobs: vi.fn(), tx: vi.fn(), write: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  pet: { findFirst: m.owner }, petVetVisit: { findMany: m.visits },
  galleryStorageJob: { findMany: m.jobs }, $transaction: m.tx,
  user: { update: m.write },
} }));
vi.mock("@gafus/cdn-upload", () => ({
  uploadVetVisitFile: vi.fn(), vetVisitFileKeys: vi.fn(), vetVisitMediaUrl: vi.fn(),
}));
vi.mock("../gallery/persistence", () => ({ enqueueDelete: vi.fn() }));
import { listPetVetVisits } from "./petVetVisitService";
const visit = (id: string, date: string) => ({
  id, petId: "pet-A", visitedOn: new Date(date), specialty: "synthetic",
  doctorName: "", clinic: "", diagnosis: "PHI_SYNTHETIC_MEDICAL",
  conclusion: "", notes: "", createdAt: new Date(date),
  attachments: [{ id: `att-${id}`, name: "synthetic.png", mimeType: "image/png",
    sizeBytes: 50, previewKey: null, originalKey: "SECRET_PRIVATE_S3_KEY" }],
});
beforeEach(() => {
  vi.clearAllMocks();m.owner.mockResolvedValue({id:"pet-A"});
  m.visits.mockResolvedValue([visit("new", "2026-10-18T00:00:00Z"),
    visit("old", "2026-09-05T00:00:00Z")]);
  m.jobs.mockResolvedValue([]);
});
describe("AG1 Vet history list existing Core SELECT-only contract", () => {
  it("L01 owner-and-pet scoped history desc with attachment metadata, no media keys", async () => {
    const rows = await listPetVetVisits("pet-A", "owner-A");
    expect(m.owner).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "owner-A" }, select: { id: true },
    });
    expect(m.visits).toHaveBeenCalledWith({
      where: { petId: "pet-A", ownerId: "owner-A" },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ visitedOn: "desc" }, { createdAt: "desc" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map(x => x.visitedOn)).toEqual(["2026-10-18", "2026-09-05"]);
    expect(rows[0]?.attachments[0]).toMatchObject({ hasPreview: false, previewProcessing: false });
    expect(JSON.stringify(rows)).not.toContain("SECRET_PRIVATE_S3_KEY");
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("L02 zero owned visits => [] with no pending preview query", async () => {
    m.visits.mockResolvedValueOnce([]);
    expect(await listPetVetVisits("pet-A", "owner-A")).toEqual([]);
    expect(m.jobs).not.toHaveBeenCalled();
  });
  it("L03 nonexistent/foreign pet 404 before history/preview queries", async () => {
    m.owner.mockResolvedValueOnce(null);
    await expect(listPetVetVisits("pet-A", "foreign-B"))
      .rejects.toMatchObject({ status: 404 });
    expect(m.visits).not.toHaveBeenCalled();
    expect(m.jobs).not.toHaveBeenCalled();
  });
  it("L04 previewProcessing computed only by readonly jobs and no writes", async () => {
    m.jobs.mockResolvedValueOnce([{ dedupeKey: "vet-preview:att-new" }]);
    const result=await listPetVetVisits("pet-A", "owner-A");
    expect(result[0]?.attachments[0]?.previewProcessing).toBe(true);
    expect(result[1]?.attachments[0]?.previewProcessing).toBe(false);
    expect(m.jobs).toHaveBeenCalledWith({
      where: { dedupeKey: { in: ["vet-preview:att-new", "vet-preview:att-old"] },
        status: { in: ["pending", "processing"] } }, select: { dedupeKey: true },
    });
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
});
