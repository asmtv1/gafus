/** Two HTTP service instances must never share an ambient veterinary DB reader. */
import { describe, expect, it, vi } from "vitest";
import type { VetVisitRowsPort } from "./vetVisitRowsPort";
import { listPetVetVisits } from "./petVetVisitService";
vi.mock("@gafus/cdn-upload", () => ({ uploadVetVisitFile: vi.fn(), vetVisitFileKeys: vi.fn(), vetVisitMediaUrl: vi.fn() }));
vi.mock("../gallery/persistence", () => ({ enqueueDelete: vi.fn() }));

describe("VetVisitRowsPort explicit Core composition", () => {
  function scoped(owner: string) {
    const listOwnPetVetRows = vi.fn(async (petId: string, actualOwner: string) => {
      if (actualOwner !== owner) throw new Error("VET_TEST_OWNER_MISMATCH");
      return { rows: [{
        id: `visit-${owner}`, petId, ownerId: owner,
        visitedOn: new Date("2026-11-18T00:00:00.000Z"),
        specialty: "test-only", doctorName: "", clinic: "", diagnosis: "", conclusion: "", notes: "",
        createdAt: new Date("2026-11-18T00:00:00.000Z"),
        updatedAt: new Date("2026-11-18T00:00:00.000Z"), attachments: [],
      }], pending: new Set<string>() };
    });
    const rows = { listOwnPetVetRows, isVetVisitDbError: () => false } as unknown as VetVisitRowsPort;
    return { rows, listOwnPetVetRows };
  }
  it("routes two independent owner-scope readers with no registration or crossover", async () => {
    const a = scoped("owner-A"), b = scoped("owner-B");
    await expect(listPetVetVisits("pet-1", "owner-A", a.rows)).resolves.toMatchObject([{ id: "visit-owner-A" }]);
    await expect(listPetVetVisits("pet-2", "owner-B", b.rows)).resolves.toMatchObject([{ id: "visit-owner-B" }]);
    expect(a.listOwnPetVetRows).toHaveBeenCalledExactlyOnceWith("pet-1", "owner-A");
    expect(b.listOwnPetVetRows).toHaveBeenCalledExactlyOnceWith("pet-2", "owner-B");
    await expect(listPetVetVisits("pet-1", "owner-B", a.rows)).rejects.toThrow("VET_TEST_OWNER_MISMATCH");
  });
});
